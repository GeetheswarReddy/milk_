set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','farmer','{"id":"1","name":"Test"}',1);
select public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','farmer','{"id":"1","name":"Test"}',1);
select public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','delivery','{"id":"dddddddd-dddd-dddd-dddd-dddddddddddd","farmerId":"1","session":{"date":"2026-09-16","period":"morning"},"rate":"40","createdAt":"2026-09-16T00:00:00Z"}',1);
select public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','can','{"id":"cccccccc-cccc-cccc-cccc-cccccccccccc","deliveryId":"dddddddd-dddd-dddd-dddd-dddddddddddd","original":{"volume":"10","fat":"3.2","decision":"rejected","rejectionReason":"Sour smell","photoId":"ffffffff-ffff-ffff-ffff-ffffffffffff","photoUnavailableReason":""},"corrections":[],"void":null,"createdAt":"2026-09-16T00:00:00Z"}',1);
select public.reserve_photo('ffffffff-ffff-ffff-ffff-ffffffffffff','cccccccc-cccc-cccc-cccc-cccccccccccc');
select public.reserve_photo('ffffffff-ffff-ffff-ffff-ffffffffffff','cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into storage.objects(bucket_id,name) values('evidence','11111111-1111-1111-1111-111111111111/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg');
do $$begin
 if (select count(*) from public.intake_events)<>3 then raise exception 'Idempotency failed'; end if;
 begin perform public.reserve_photo('ffffffff-ffff-ffff-ffff-fffffffffffe','cccccccc-cccc-cccc-cccc-cccccccccccc'); raise exception 'Unrelated reservation accepted'; exception when raise_exception then if SQLERRM='Unrelated reservation accepted' then raise; end if; end;
 begin update public.intake_entities set payload='{}'; raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','can',jsonb_set((select payload from public.intake_entities where kind='can'),'{original,volume}','"15"'),2); raise exception 'Original mutation accepted'; exception when raise_exception then if SQLERRM='Original mutation accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$begin
 if exists(select 1 from public.intake_entities) or exists(select 1 from storage.objects) then raise exception 'Workspace isolation failed'; end if;
 begin insert into storage.objects(bucket_id,name) values('evidence','11111111-1111-1111-1111-111111111111/steal.jpg'); raise exception 'Cross workspace upload allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','can',jsonb_set((select payload from public.intake_entities where kind='can'),'{corrections}',jsonb_build_array(jsonb_build_object('id','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','reason','Reading correction','at','2026-09-16T01:00:00Z','values',jsonb_set((select payload->'original' from public.intake_entities where kind='can'),'{volume}','"15"')))),2);
do $$begin
 begin perform public.sync_event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','can',jsonb_set((select payload from public.intake_entities where kind='can'),'{corrections}','[]'),3); raise exception 'History removal accepted'; exception when raise_exception then if SQLERRM='History removal accepted' then raise; end if; end;
end $$;
