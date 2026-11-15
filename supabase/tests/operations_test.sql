begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.operation_teams (name, area, lead_name, created_by_name, is_test)
values ('Tim E2E hidden', 'Test area', 'Test lead', 'Test runner', false);

insert into public.operation_incidents (
  reference, source_type, title, description, lat, lon, created_by_name, is_test
) values (
  'E2E-HIDDEN', 'manual', 'E2E hidden incident', 'E2E Supabase hidden fixture',
  -1.2, 110.4, 'Test runner', false
);

set local role anon;

select throws_ok(
  $$select * from public.profiles$$,
  '42501', null, 'public visitors cannot read unused officer profiles'
);

select lives_ok(
  $$select * from public.operation_incidents$$,
  'public visitors can read incidents without signing in'
);

select is(
  (select count(*)::int from public.operation_teams where name = 'Tim E2E hidden'),
  0,
  'public RLS hides E2E teams even when the caller knows the exact name'
);

select is(
  (select count(*)::int from public.operation_incidents where reference = 'E2E-HIDDEN'),
  0,
  'public RLS hides E2E incidents even when the caller knows the exact reference'
);

select lives_ok(
  $$select public.create_operation_team('{"name":"Manggala Public","area":"Synthetic district","leadName":"Public Commander","contact":"radio-01","availability":"available"}'::jsonb)$$,
  'public visitors can create field teams through the validated RPC'
);

select lives_ok(
  $$select public.create_operation_incident('{"sourceType":"satellite","sourceId":"test-hotspot-1","sourceSnapshot":{"frp":12.5},"title":"Synthetic hotspot","description":"Test-only observation","lat":-1.2,"lon":110.4,"adminLabel":"Test district","reason":"Create a synthetic incident for public workflow testing."}'::jsonb)$$,
  'public visitors can create incidents through the validated RPC'
);

select is(
  (select count(*)::int from public.operation_incidents where source_id = 'test-hotspot-1'),
  1,
  'the public incident is readable'
);

select is(
  (select created_by_name from public.operation_incidents where source_id = 'test-hotspot-1'),
  'Public Operator',
  'public changes use a generic audit identity'
);

select is(
  (select actor_name from public.operation_timeline where incident_id = (select id from public.operation_incidents where source_id='test-hotspot-1')),
  'Public Operator',
  'the audit timeline records the public identity'
);

select throws_ok(
  $$insert into public.operation_incidents(reference,source_type,title,lat,lon,created_by_name) values ('BYPASS-1','manual','Bypass attempt',0,110,'Bypass')$$,
  '42501', null, 'public visitors cannot bypass the validated RPC with direct writes'
);

select lives_ok(
  $$select public.mutate_operation_incident((select id from public.operation_incidents where source_id='test-hotspot-1'),1,'verification','confirmed','Public workflow confirmed the synthetic observation.')$$,
  'public visitors can record human verification'
);

select is(
  (select verification::text from public.operation_incidents where source_id='test-hotspot-1'),
  'confirmed',
  'verification is persisted'
);

select is(
  (select row_version from public.operation_incidents where source_id='test-hotspot-1'),
  2::bigint,
  'public mutations increment the row version'
);

select throws_ok(
  $$select public.mutate_operation_incident((select id from public.operation_incidents where source_id='test-hotspot-1'),1,'priority','high','This request deliberately uses a stale version.')$$,
  '40001', null, 'stale public writes are rejected'
);

select lives_ok(
  $$select public.mutate_operation_incident((select id from public.operation_incidents where source_id='test-hotspot-1'),2,'priority','high','Public workflow marks the synthetic incident as high priority.')$$,
  'public visitors can set incident priority'
);

select lives_ok(
  $$select public.mutate_operation_incident((select id from public.operation_incidents where source_id='test-hotspot-1'),3,'assignment',(select id::text from public.operation_teams where name='Manggala Public'),'Assign the public test team for synthetic field follow-up.')$$,
  'public visitors can assign an available team'
);

select lives_ok(
  $$select public.mutate_operation_incident((select id from public.operation_incidents where source_id='test-hotspot-1'),4,'status','in_progress','The public test team has started its synthetic response.')$$,
  'public visitors can move an assigned incident into progress'
);

select is(
  (select status::text from public.operation_incidents where source_id='test-hotspot-1'),
  'in_progress',
  'the public status update is persisted'
);

select is(
  (select count(*)::int from public.operation_timeline where incident_id = (select id from public.operation_incidents where source_id='test-hotspot-1')),
  5,
  'every public workflow mutation appends an audit event'
);

select is(
  (select count(*)::int from public.operation_notifications where incident_id = (select id from public.operation_incidents where source_id='test-hotspot-1')),
  3,
  'priority, assignment and status changes create notifications'
);

reset role;

select throws_ok(
  $$update public.operation_timeline set reason='Tampered audit reason'$$,
  '42501', null, 'the audit timeline cannot be updated'
);

select throws_ok(
  $$truncate public.operation_notifications$$,
  '42501', null, 'notifications cannot be truncated'
);

select * from finish();
rollback;
