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
  outcome text
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
