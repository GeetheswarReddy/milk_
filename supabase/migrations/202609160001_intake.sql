-- Anonymous Supabase Auth users have authenticated role. No service key in browser.
create table public.intake_entities (
 workspace_id uuid not null references auth.users(id), kind text not null check(kind in ('farmer','delivery','can','settings','photo')),
 entity_id text not null, revision integer not null check(revision > 0), payload jsonb not null,
 primary key(workspace_id,kind,entity_id)
);
create table public.intake_events (
 sequence bigint generated always as identity primary key, workspace_id uuid not null references auth.users(id),
 event_id uuid not null, kind text not null, revision integer not null, payload jsonb not null,
 received_at timestamptz not null default now(), unique(workspace_id,event_id)
);
create table public.photo_reservations (
 workspace_id uuid not null references auth.users(id), photo_id uuid not null, can_id uuid not null,
 object_name text not null unique, reserved_bytes integer not null default 100000 check(reserved_bytes=100000),
 primary key(workspace_id,photo_id)
);
alter table public.intake_entities enable row level security;
alter table public.intake_events enable row level security;
alter table public.photo_reservations enable row level security;
create policy own_entities on public.intake_entities for select to authenticated using(workspace_id=(select auth.uid()));
create policy own_events on public.intake_events for select to authenticated using(workspace_id=(select auth.uid()));
create policy own_reservations on public.photo_reservations for select to authenticated using(workspace_id=(select auth.uid()));
revoke all on public.intake_entities,public.intake_events,public.photo_reservations from anon,authenticated;
grant select on public.intake_entities,public.intake_events,public.photo_reservations to authenticated;

create function public.valid_can_values(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) <> 'object' or coalesce(v->>'volume','') !~ '^\d+(\.\d{1,2})?$' then return false; end if;
 if (v->>'volume')::numeric <= 0 or (v->>'volume')::numeric > 10000000 then return false; end if;
 if v->'fat' is null then return false; end if;
 if v->'fat' <> 'null'::jsonb then
  if coalesce(v->>'fat','') !~ '^\d+(\.\d{1,2})?$' then return false; end if;
  if (v->>'fat')::numeric > 100 then return false; end if;
 end if;
 if v->>'decision'='accepted' then return v->'fat' <> 'null'::jsonb and coalesce(v->>'photoId','')=''; end if;
 if v->>'decision'='rejected' then
  return length(trim(coalesce(v->>'rejectionReason',''))) > 0 and (length(coalesce(v->>'photoId',''))>0 or length(trim(coalesce(v->>'photoUnavailableReason','')))>0);
 end if;
 return false;
end $$;

create function public.sync_event(p_event_id uuid,p_kind text,p_payload jsonb,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); eid text:=p_payload->>'id'; old public.intake_entities%rowtype; ev public.intake_events%rowtype; item jsonb; i integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_event_id is null or p_revision is null or p_revision<1 or p_kind is null or p_kind not in ('farmer','delivery','can','settings','photo') or coalesce(length(eid),0)=0 or length(eid)>100 or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>262144 then raise exception 'Invalid event'; end if;
 -- Serializes mutations within one workspace, including concurrent cap checks.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into ev from public.intake_events where workspace_id=uid and event_id=p_event_id;
 if found then
  if ev.kind<>p_kind or ev.revision<>p_revision or ev.payload<>p_payload then raise exception 'Event ID reused with different content'; end if;
  return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 select * into old from public.intake_entities where workspace_id=uid and kind=p_kind and entity_id=eid;
 if old.revision=p_revision and old.payload<>p_payload then raise exception 'Revision conflict'; end if;
 if old.revision is null or p_revision>old.revision then
  if p_kind='farmer' then
   if eid !~ '^(0|[1-9][0-9]*)$' or length(trim(coalesce(p_payload->>'name','')))=0 then raise exception 'Invalid farmer'; end if;
  elsif p_kind='delivery' then
   perform eid::uuid;
   if coalesce(p_payload->>'createdAt','')='' then raise exception 'Creation time required'; end if;
   perform (p_payload->>'createdAt')::timestamptz;
   if not exists(select 1 from public.intake_entities where workspace_id=uid and kind='farmer' and entity_id=p_payload->>'farmerId') then raise exception 'Farmer must sync first'; end if;
   if coalesce(p_payload#>>'{session,period}','') not in ('morning','evening') or coalesce(p_payload#>>'{session,date}','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_payload->>'rate','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'Invalid delivery'; end if;
   perform (p_payload#>>'{session,date}')::date;
   if (p_payload->>'rate')::numeric<=0 then raise exception 'Rate must be positive'; end if;
   if old.revision is not null and old.payload<>p_payload then raise exception 'Delivery context and rate are immutable'; end if;
  elsif p_kind='can' then
   perform eid::uuid;
   if coalesce(p_payload->>'createdAt','')='' then raise exception 'Creation time required'; end if;
   perform (p_payload->>'createdAt')::timestamptz;
   if not exists(select 1 from public.intake_entities where workspace_id=uid and kind='delivery' and entity_id=p_payload->>'deliveryId') then raise exception 'Delivery must sync first'; end if;
   if public.valid_can_values(p_payload->'original') is not true or jsonb_typeof(p_payload->'corrections') is distinct from 'array' then raise exception 'Invalid can'; end if;
   for item in select value from jsonb_array_elements(p_payload->'corrections') loop
    if public.valid_can_values(item->'values') is not true or length(trim(coalesce(item->>'reason','')))=0 or coalesce(item->>'at','')='' or coalesce(item->>'id','')='' then raise exception 'Invalid correction'; end if;
    perform (item->>'id')::uuid; perform (item->>'at')::timestamptz;
   end loop;
   if p_payload->'void' is null then raise exception 'Missing void state'; end if;
   if p_payload->'void'<>'null'::jsonb then
    if length(trim(coalesce(p_payload#>>'{void,reason}','')))=0 or coalesce(p_payload#>>'{void,at}','')='' then raise exception 'Void needs reason and time'; end if;
    perform (p_payload#>>'{void,at}')::timestamptz;
   end if;
   if old.revision is null then
    if (select count(*) from public.intake_entities where workspace_id=uid and kind='can')>=2000 then raise exception 'Workspace limit: 2,000 can entries. Local data retained.'; end if;
   else
    if old.payload->'original' is distinct from p_payload->'original' or old.payload->'deliveryId' is distinct from p_payload->'deliveryId' or old.payload->'createdAt' is distinct from p_payload->'createdAt' then raise exception 'Original can is immutable'; end if;
    if jsonb_array_length(p_payload->'corrections')<jsonb_array_length(old.payload->'corrections') then raise exception 'Correction history cannot shrink'; end if;
    for i in 0..jsonb_array_length(old.payload->'corrections')-1 loop
     if old.payload->'corrections'->i is distinct from p_payload->'corrections'->i then raise exception 'Correction history is immutable'; end if;
    end loop;
    if old.payload->'void'<>'null'::jsonb and old.payload<>p_payload then raise exception 'Voided can is immutable'; end if;
   end if;
  elsif p_kind='settings' then
   if eid<>'settings' or coalesce(p_payload->>'rate','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'Invalid settings'; end if;
  elsif p_kind='photo' then
   perform eid::uuid;
   if coalesce(p_payload->>'size','') !~ '^\d+$' or (p_payload->>'size')::numeric>100000 then raise exception 'Photo exceeds 100 KB'; end if;
  end if;
  insert into public.intake_entities values(uid,p_kind,eid,p_revision,p_payload)
   on conflict(workspace_id,kind,entity_id) do update set revision=excluded.revision,payload=excluded.payload;
 end if;
 insert into public.intake_events(workspace_id,event_id,kind,revision,payload) values(uid,p_event_id,p_kind,p_revision,p_payload);
 return jsonb_build_object('ok',true);
end $$;

create function public.reserve_photo(p_photo_id uuid,p_can_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.photo_reservations%rowtype; can_payload jsonb; object_path text;
begin
 if uid is null or p_photo_id is null or p_can_id is null then raise exception 'Authentication and photo/can IDs required'; end if;
 -- Global reservation lock prevents cross-workspace races at the demo cap.
 perform pg_advisory_xact_lock(7284100921::bigint);
 select * into existing from public.photo_reservations where workspace_id=uid and photo_id=p_photo_id;
 if found then
  if existing.can_id<>p_can_id then raise exception 'Photo already belongs to another can'; end if;
  return existing.object_name;
 end if;
 select payload into can_payload from public.intake_entities where workspace_id=uid and kind='can' and entity_id=p_can_id::text;
 if can_payload is null or (can_payload#>>'{original,photoId}'=p_photo_id::text or exists(select 1 from jsonb_array_elements(can_payload->'corrections') c where c#>>'{values,photoId}'=p_photo_id::text)) is not true then raise exception 'Referenced can must sync first'; end if;
 if (select count(*) from public.photo_reservations where workspace_id=uid)>=200 then raise exception 'Workspace photo limit: 200. Local photo retained.'; end if;
 if (select coalesce(sum(reserved_bytes),0) from public.photo_reservations)+100000>200000000 then raise exception 'Demo photo capacity reached. Local photo retained.'; end if;
 object_path:=uid::text||'/'||p_photo_id::text||'.jpg';
 insert into public.photo_reservations(workspace_id,photo_id,can_id,object_name) values(uid,p_photo_id,p_can_id,object_path);
 return object_path;
end $$;
revoke all on function public.valid_can_values(jsonb),public.sync_event(uuid,text,jsonb,integer),public.reserve_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sync_event(uuid,text,jsonb,integer),public.reserve_photo(uuid,uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidence','evidence',false,100000,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=100000,allowed_mime_types=array['image/jpeg'];
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and exists(select 1 from public.photo_reservations r where r.workspace_id=(select auth.uid()) and r.object_name=storage.objects.name));
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='evidence' and exists(select 1 from public.photo_reservations r where r.workspace_id=(select auth.uid()) and r.object_name=storage.objects.name));
-- No update/delete policies: retries check existing object and never overwrite evidence.
