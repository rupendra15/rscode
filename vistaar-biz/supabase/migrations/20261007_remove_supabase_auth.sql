-- Remove the previous Supabase Auth/RLS dependency.
-- Vistaar APIs use the application session cookie and the server-side database key.
drop policy if exists "users can read their own role" on user_roles;
drop policy if exists "users can read businesses they belong to" on businesses;
drop policy if exists "users can read their assessments" on growth_assessments;
drop policy if exists "workspace members can read workspace members" on workspace_members;
drop policy if exists "workspace participants can read audits" on growth_audits;
drop policy if exists "workspace participants can read actions" on growth_actions;
drop policy if exists "workspace participants can read leads" on growth_leads;
drop policy if exists "workspace participants can read measurements" on growth_measurements;
drop policy if exists "workspace participants can read specialist requests" on specialist_requests;
drop policy if exists "workspace participants can read evidence" on growth_evidence;
drop policy if exists "operators can read enquiries" on enquiries;
drop policy if exists "operators can read outreach" on manager_outreach;

do $$
begin
  if exists (select 1 from pg_constraint where conname='user_roles_user_id_fkey') then
    alter table user_roles drop constraint user_roles_user_id_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname='user_roles_user_id_app_users_fkey') then
    alter table user_roles add constraint user_roles_user_id_app_users_fkey
      foreign key (user_id) references app_users(id) on delete cascade;
  end if;
end $$;

alter table user_roles enable row level security;
alter table app_users enable row level security;
alter table app_sessions enable row level security;

-- Browser clients never access these tables directly. Server-side API access
-- uses the database service key, so no Supabase Auth policies are needed.
