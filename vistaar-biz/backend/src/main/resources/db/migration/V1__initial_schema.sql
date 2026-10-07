create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  email varchar(320) not null,
  password_hash varchar(255) not null,
  password_salt varchar(255) not null,
  role varchar(30) not null check (role in ('admin','manager')),
  status varchar(30) not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists ux_app_users_email on app_users(lower(email));

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists ix_app_sessions_user on app_sessions(user_id);
create index if not exists ix_app_sessions_expiry on app_sessions(expires_at);

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  owner_email varchar(320),
  owner_user_id uuid,
  name varchar(300) not null,
  industry varchar(200) not null,
  city varchar(200) not null,
  goal text not null,
  website text,
  workspace_stage varchar(50) not null default 'new',
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_businesses_activity on businesses(last_activity_at desc);

create table if not exists growth_assessments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  audit_id uuid,
  owner_user_id uuid,
  version integer not null default 1,
  business_name text not null,
  industry text not null,
  city text not null,
  service_area text not null,
  ideal_customer text not null,
  offerings text not null,
  differentiator text not null,
  goal text not null,
  target text not null,
  constraint_text text not null,
  channels text not null,
  monthly_leads text,
  conversion text,
  website text,
  google text,
  instagram text,
  other_links text,
  challenge text not null,
  notes text,
  status varchar(40) not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists growth_audits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  overall_score integer not null,
  maturity varchar(100) not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table growth_assessments add constraint fk_assessment_audit
  foreign key (audit_id) references growth_audits(id) on delete set null;

create table if not exists growth_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  audit_id uuid references growth_audits(id) on delete set null,
  title text not null,
  area varchar(100) not null,
  impact integer not null,
  effort varchar(50) not null,
  mode varchar(50) not null,
  status varchar(50) not null default 'recommended',
  steps jsonb,
  deliverable text,
  measurement text,
  outcome text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists growth_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  assessment_id uuid references growth_assessments(id) on delete set null,
  audit_id uuid references growth_audits(id) on delete set null,
  source varchar(100) not null,
  evidence_type varchar(100) not null,
  claim text not null,
  value text,
  confidence varchar(30) not null default 'medium',
  metadata jsonb,
  observed_at timestamptz not null default now()
);

create table if not exists enquiries (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  business_name varchar(300) not null,
  phone varchar(50) not null,
  email varchar(320),
  need text not null,
  question text not null,
  source varchar(100) not null default 'vistaar-biz-website',
  status varchar(50) not null default 'new',
  assigned_manager_user_id uuid references app_users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists readiness_submissions (
  id uuid primary key default gen_random_uuid(),
  answers jsonb not null,
  readiness_score integer not null,
  source varchar(100) not null default 'website-readiness-check',
  created_at timestamptz not null default now()
);

create table if not exists growth_leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source varchar(100) not null,
  external_id varchar(200),
  name varchar(200),
  phone varchar(50),
  email varchar(320),
  status varchar(50) not null default 'new',
  value numeric,
  currency varchar(10) default 'INR',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists growth_measurements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  action_id uuid references growth_actions(id) on delete set null,
  metric_name varchar(200) not null,
  baseline_value numeric,
  current_value numeric,
  unit varchar(50),
  source varchar(100) not null,
  measured_at timestamptz not null default now(),
  metadata jsonb
);

create table if not exists specialist_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  action_id uuid references growth_actions(id) on delete set null,
  specialist_type varchar(100) not null,
  brief text not null,
  status varchar(50) not null default 'recommended',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manager_outreach (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  manager_user_id uuid not null references app_users(id) on delete cascade,
  status varchar(50) not null default 'not_contacted',
  notes text,
  contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, manager_user_id)
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references app_users(id) on delete cascade,
  role varchar(30) not null check (role in ('admin','manager','owner','user')),
  status varchar(30) not null default 'active',
  created_at timestamptz not null default now(),
  unique(business_id, user_id)
);

create index if not exists ix_assessments_created on growth_assessments(created_at desc);
create index if not exists ix_assessments_business on growth_assessments(business_id, created_at desc);
create index if not exists ix_audits_business on growth_audits(business_id, created_at desc);
create index if not exists ix_actions_business on growth_actions(business_id, status);
create index if not exists ix_evidence_business on growth_evidence(business_id, observed_at desc);
create index if not exists ix_enquiries_status on enquiries(status, created_at desc);
create index if not exists ix_readiness_created on readiness_submissions(created_at desc);
create index if not exists ix_leads_business on growth_leads(business_id, created_at desc);
create index if not exists ix_measurements_business on growth_measurements(business_id, measured_at desc);
create index if not exists ix_specialists_business on specialist_requests(business_id, status, created_at desc);
create index if not exists ix_outreach_manager on manager_outreach(manager_user_id, status);
