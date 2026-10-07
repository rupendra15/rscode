-- Vistaar-Biz workspace lifecycle and execution fields
alter table businesses add column if not exists workspace_stage text not null default 'new';
alter table businesses add column if not exists last_activity_at timestamptz not null default now();

alter table growth_actions add column if not exists started_at timestamptz;
alter table growth_actions add column if not exists completed_at timestamptz;
alter table growth_actions add column if not exists outcome text;

create index if not exists growth_business_stage_idx on businesses(workspace_stage,last_activity_at desc);
