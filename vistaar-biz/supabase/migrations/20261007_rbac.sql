-- Vistaar role-based access control.
create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin','manager','user')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_roles_role_idx on user_roles(role,status);

alter table businesses add column if not exists owner_user_id text;
alter table growth_assessments add column if not exists owner_user_id text;
alter table enquiries add column if not exists assigned_manager_user_id text;
alter table enquiries add column if not exists contacted_at timestamptz;

alter table user_roles enable row level security;
create policy "users can read their own role" on user_roles
  for select using (user_id = auth.uid());

alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check check (role in ('admin','manager','user','owner'));

create table if not exists manager_outreach (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  manager_user_id text not null,
  status text not null default 'not_contacted' check (status in ('not_contacted','contacted','follow_up','converted','closed')),
  notes text,
  contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,manager_user_id)
);
create index if not exists manager_outreach_manager_idx on manager_outreach(manager_user_id,status);
create index if not exists manager_outreach_business_idx on manager_outreach(business_id,status);
alter table manager_outreach enable row level security;

-- Business ownership and role policies for direct Supabase access once the app
-- uses authenticated JWTs. Server-side service-role APIs still enforce the
-- same authorization explicitly.
create policy "users can read businesses they belong to" on businesses
  for select using (
    owner_user_id = auth.uid()::text
    or exists (
      select 1 from workspace_members wm
      where wm.business_id = businesses.id
        and wm.user_id = auth.uid()::text
        and wm.status = 'active'
    )
  );
create policy "users can read their assessments" on growth_assessments
  for select using (
    owner_user_id = auth.uid()::text
    or exists (
      select 1 from workspace_members wm
      where wm.business_id = growth_assessments.business_id
        and wm.user_id = auth.uid()::text
        and wm.status = 'active'
    )
  );


alter table growth_assessments add column if not exists version integer not null default 1;
create index if not exists growth_assessments_owner_idx on growth_assessments(owner_user_id,created_at desc);
create index if not exists businesses_owner_idx on businesses(owner_user_id,created_at desc);


-- Read access for authenticated workspace participants and Vistaar operators.
create policy "workspace members can read workspace members" on workspace_members
  for select using (
    user_id = auth.uid()::text
    or exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
  );

create policy "workspace participants can read audits" on growth_audits
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
    or exists (select 1 from businesses b where b.id=growth_audits.business_id and b.owner_user_id=auth.uid()::text)
    or exists (select 1 from workspace_members wm where wm.business_id=growth_audits.business_id and wm.user_id=auth.uid()::text and wm.status='active')
  );

create policy "workspace participants can read actions" on growth_actions
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
    or exists (select 1 from businesses b where b.id=growth_actions.business_id and b.owner_user_id=auth.uid()::text)
    or exists (select 1 from workspace_members wm where wm.business_id=growth_actions.business_id and wm.user_id=auth.uid()::text and wm.status='active')
  );

create policy "workspace participants can read leads" on growth_leads
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
    or exists (select 1 from businesses b where b.id=growth_leads.business_id and b.owner_user_id=auth.uid()::text)
    or exists (select 1 from workspace_members wm where wm.business_id=growth_leads.business_id and wm.user_id=auth.uid()::text and wm.status='active')
  );

create policy "workspace participants can read measurements" on growth_measurements
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
    or exists (select 1 from businesses b where b.id=growth_measurements.business_id and b.owner_user_id=auth.uid()::text)
    or exists (select 1 from workspace_members wm where wm.business_id=growth_measurements.business_id and wm.user_id=auth.uid()::text and wm.status='active')
  );

create policy "workspace participants can read specialist requests" on specialist_requests
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
    or exists (select 1 from businesses b where b.id=specialist_requests.business_id and b.owner_user_id=auth.uid()::text)
    or exists (select 1 from workspace_members wm where wm.business_id=specialist_requests.business_id and wm.user_id=auth.uid()::text and wm.status='active')
  );

create policy "workspace participants can read evidence" on growth_evidence
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
    or exists (select 1 from businesses b where b.id=growth_evidence.business_id and b.owner_user_id=auth.uid()::text)
    or exists (select 1 from workspace_members wm where wm.business_id=growth_evidence.business_id and wm.user_id=auth.uid()::text and wm.status='active')
  );

create policy "operators can read enquiries" on enquiries
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager') and ur.status='active')
  );

create policy "operators can read outreach" on manager_outreach
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role='admin' and ur.status='active')
    or manager_user_id = auth.uid()::text
  );
