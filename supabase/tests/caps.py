"""Run only against the disposable PostgreSQL database bootstrapped by bootstrap.sql."""
import subprocess, json, uuid, os
from concurrent.futures import ThreadPoolExecutor
CMD = ['psql','-h',os.environ.get('PGHOST','/tmp'),'-p',os.environ.get('PGPORT','55438'),'-d',os.environ.get('PGDATABASE','postgres'),'-v','ON_ERROR_STOP=1','-At']
def sql(command, check=True):
    return subprocess.run(CMD,input=command,text=True,capture_output=True,check=check)
def ident(): return str(uuid.uuid4())
uid='11111111-1111-1111-1111-111111111111'
can=json.loads(sql("select payload from public.intake_entities where kind='can' limit 1").stdout)
def rpc(can):
    payload=json.dumps(can).replace("'","''")
    return sql(f"set role authenticated; select set_config('request.jwt.claim.sub','{uid}',false); begin; select public.sync_event('{ident()}','can','{payload}',1); select pg_sleep(.15); commit;",False)
sql("insert into public.intake_entities select workspace_id,kind,gen_random_uuid()::text,revision,payload from public.intake_entities cross join generate_series(1,1998) where kind='can';")
a={**can,'id':ident()}; b={**can,'id':ident()}
with ThreadPoolExecutor(2) as pool: results=list(pool.map(rpc,[a,b]))
assert sum(r.returncode==0 for r in results)==1,results
assert '2,000 can entries' in ''.join(r.stderr for r in results)
assert sql("select count(*) from public.intake_entities where kind='can'").stdout.strip()=='2000'
# Fill global capacity to 1,999 reservations. Last two concurrent requests must
# share the final 100KB slot, even across separate authenticated workspaces.
sql("truncate public.photo_reservations; insert into public.photo_reservations select '22222222-2222-2222-2222-222222222222',gen_random_uuid(),gen_random_uuid(),'fixture/'||n from generate_series(1,1999) n;")
pids=[ident(),ident()]
third='33333333-3333-3333-3333-333333333333'
sql(f"insert into auth.users values('{third}') on conflict do nothing;")
for photo,record,owner in zip(pids,[a,b],[uid,third]):
    record['original']['photoId']=photo
    payload=json.dumps(record).replace("'","''")
    sql(f"insert into public.intake_entities values('{owner}','can','{record['id']}',1,'{payload}') on conflict(workspace_id,kind,entity_id) do update set payload=excluded.payload;")
def reserve(pair):
    photo,record,owner=pair
    return sql(f"set role authenticated;select set_config('request.jwt.claim.sub','{owner}',false);begin;select public.reserve_photo('{photo}','{record['id']}');select pg_sleep(.15);commit;",False)
with ThreadPoolExecutor(2) as pool: results=list(pool.map(reserve,zip(pids,[a,b],[uid,third])))
assert sum(r.returncode==0 for r in results)==1,results
assert 'Demo photo capacity' in ''.join(r.stderr for r in results)
assert sql('select sum(reserved_bytes) from public.photo_reservations').stdout.strip()=='200000000'
# Workspace cap is independent of the global cap.
sql(f"truncate public.photo_reservations;insert into public.photo_reservations select '{uid}',gen_random_uuid(),gen_random_uuid(),'fixture/'||n from generate_series(1,200) n;")
r=reserve((pids[0],a,uid))
assert r.returncode!=0 and 'Workspace photo limit' in r.stderr,r
print('PASS concurrent can cap, concurrent global photo cap, workspace photo cap')
