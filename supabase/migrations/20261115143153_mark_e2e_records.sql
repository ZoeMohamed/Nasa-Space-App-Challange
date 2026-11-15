alter table public.operation_teams
add column if not exists is_test boolean not null default false;

alter table public.operation_incidents
add column if not exists is_test boolean not null default false;

update public.operation_teams
set is_test = true
where name ilike 'Tim E2E %';

update public.operation_incidents
set is_test = true
where title ilike 'E2E %'
   or description ilike 'E2E %';

create or replace function private.mark_operation_e2e()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'operation_teams' then
    new.is_test := new.is_test or new.name ilike 'Tim E2E %';
  else
    new.is_test := new.is_test
      or new.title ilike 'E2E %'
      or new.description ilike 'E2E %';
  end if;
  return new;
end;
$$;

revoke all on function private.mark_operation_e2e() from public, anon, authenticated;

drop trigger if exists operation_teams_mark_e2e on public.operation_teams;
create trigger operation_teams_mark_e2e
before insert or update of name, is_test on public.operation_teams
for each row execute function private.mark_operation_e2e();

drop trigger if exists operation_incidents_mark_e2e on public.operation_incidents;
create trigger operation_incidents_mark_e2e
before insert or update of title, description, is_test on public.operation_incidents
for each row execute function private.mark_operation_e2e();

drop policy operation_teams_read on public.operation_teams;
drop policy operation_incidents_read on public.operation_incidents;
drop policy operation_timeline_read on public.operation_timeline;
drop policy operation_notifications_read on public.operation_notifications;

create policy operation_teams_read on public.operation_teams
for select to anon, authenticated
using (not is_test);

create policy operation_incidents_read on public.operation_incidents
for select to anon, authenticated
using (not is_test);

create policy operation_timeline_read on public.operation_timeline
for select to anon, authenticated
using (
  exists (
    select 1
    from public.operation_incidents incident
    where incident.id = operation_timeline.incident_id
      and not incident.is_test
  )
);

create policy operation_notifications_read on public.operation_notifications
for select to anon, authenticated
using (
  incident_id is null
  or exists (
    select 1
    from public.operation_incidents incident
    where incident.id = operation_notifications.incident_id
      and not incident.is_test
  )
);

comment on column public.operation_teams.is_test is
'True for automated E2E fixtures. Public RLS excludes these rows.';

comment on column public.operation_incidents.is_test is
'True for automated E2E fixtures. Public RLS excludes these rows.';
