-- Vistaar-Biz growth loop models
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
