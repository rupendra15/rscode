-- Vistaar workspace access model.
-- Authentication/session enforcement is intentionally separate; once the auth
-- provider is connected, this table becomes the source of workspace membership.
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id text not null,
  role text not null default 'owner',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,user_id)
);
create index if not exists workspace_members_user_idx on workspace_members(user_id,status);
create index if not exists workspace_members_business_idx on workspace_members(business_id,status);
alter table workspace_members enable row level security;
