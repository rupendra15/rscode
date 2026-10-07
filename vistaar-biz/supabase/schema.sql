-- Vistaar-Biz Supabase schema
create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  owner_email text,
  name text not null,
  industry text not null,
  city text not null,
  goal text not null,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists growth_audits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  overall_score integer not null,
  maturity text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table businesses add column if not exists workspace_stage text not null default 'new';
alter table businesses add column if not exists last_activity_at timestamptz not null default now();

create table if not exists growth_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  audit_id uuid references growth_audits(id) on delete set null,
  title text not null,
  area text not null,
  impact integer not null,
  effort text not null,
  mode text not null,
  status text not null default 'recommended',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  outcome text,
  steps jsonb,
  deliverable text,
  measurement text
);

create index if not exists growth_audits_business_idx on growth_audits(business_id,created_at desc);
create index if not exists growth_actions_business_idx on growth_actions(business_id,status);

alter table businesses enable row level security;
alter table growth_audits enable row level security;
alter table growth_actions enable row level security;

-- Production RLS policies should be added after authentication is connected.


create table if not exists enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text not null,
  phone text not null,
  email text,
  need text not null,
  question text not null,
  source text not null default 'vistaar-biz-website',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists enquiries_status_idx on enquiries(status, created_at desc);

alter table enquiries enable row level security;

-- Enquiries are written only by the server-side API using the service role.
-- Do not expose a public INSERT policy for this table.

create table if not exists growth_assessments (id uuid primary key default gen_random_uuid(), business_name text not null, industry text not null, city text not null, service_area text not null, ideal_customer text not null, offerings text not null, differentiator text not null, goal text not null, target text not null, constraint text not null, channels text not null, monthly_leads text, conversion text, website text, google text, instagram text, other_links text, challenge text not null, notes text, status text not null default 'new', created_at timestamptz not null default now());
alter table growth_assessments add column if not exists business_id uuid references businesses(id) on delete set null;
alter table growth_assessments add column if not exists audit_id uuid references growth_audits(id) on delete set null;
create index if not exists growth_assessments_created_idx on growth_assessments(created_at desc);
create index if not exists growth_assessments_business_idx on growth_assessments(business_id,created_at desc);
alter table growth_assessments enable row level security;


create table if not exists growth_leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source text not null,
  external_id text,
  name text,
  phone text,
  email text,
  status text not null default 'new',
  value numeric,
  currency text default 'INR',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists growth_leads_business_idx on growth_leads(business_id,created_at desc);

create table if not exists growth_measurements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  action_id uuid references growth_actions(id) on delete set null,
  metric_name text not null,
  baseline_value numeric,
  current_value numeric,
  unit text,
  source text not null,
  measured_at timestamptz not null default now(),
  metadata jsonb
);
create index if not exists growth_measurements_business_idx on growth_measurements(business_id,measured_at desc);

create table if not exists specialist_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  action_id uuid references growth_actions(id) on delete set null,
  specialist_type text not null,
  brief text not null,
  status text not null default 'recommended',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists specialist_requests_business_idx on specialist_requests(business_id,status,created_at desc);

alter table growth_leads enable row level security;
alter table growth_measurements enable row level security;
alter table specialist_requests enable row level security;


-- Evidence used by Vistaar Intelligence. This is separate from the diagnosis so
-- every recommendation can be traced back to supplied context or observed signals.
create table if not exists growth_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  assessment_id uuid references growth_assessments(id) on delete set null,
  audit_id uuid references growth_audits(id) on delete set null,
  source text not null,
  evidence_type text not null,
  claim text not null,
  value text,
  confidence text not null default 'medium',
  metadata jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists growth_evidence_business_idx on growth_evidence(business_id,observed_at desc);
create index if not exists growth_evidence_audit_idx on growth_evidence(audit_id,observed_at desc);
alter table growth_evidence enable row level security;


-- Role-based access control and workspace ownership.
create table if not exists user_roles (
  user_id uuid primary key,
  role text not null default 'user' check (role in ('admin','manager','user')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_roles_role_idx on user_roles(role,status);
alter table user_roles enable row level security;
create policy "users can read their own role" on user_roles for select using (user_id=auth.uid());

alter table businesses add column if not exists owner_user_id text;
alter table growth_assessments add column if not exists owner_user_id text;
alter table growth_assessments add column if not exists version integer not null default 1;
alter table enquiries add column if not exists assigned_manager_user_id text;
alter table enquiries add column if not exists contacted_at timestamptz;
create index if not exists businesses_owner_idx on businesses(owner_user_id,created_at desc);
create index if not exists growth_assessments_owner_idx on growth_assessments(owner_user_id,created_at desc);

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

alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check check (role in ('admin','manager','user','owner'));


-- Application-owned authentication. No Supabase Auth is required.
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'user' check (role in ('admin','manager','user')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists app_users_email_unique_idx on app_users(lower(email));
create index if not exists app_users_role_idx on app_users(role,status);
create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists app_sessions_user_idx on app_sessions(user_id);
create index if not exists app_sessions_expires_idx on app_sessions(expires_at);
