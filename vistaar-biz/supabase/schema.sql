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
  created_at timestamptz not null default now()
);

create index if not exists growth_audits_business_idx on growth_audits(business_id,created_at desc);
create index if not exists growth_actions_business_idx on growth_actions(business_id,status);

alter table businesses enable row level security;
alter table growth_audits enable row level security;
alter table growth_actions enable row level security;

-- Production RLS policies should be added after authentication is connected.
