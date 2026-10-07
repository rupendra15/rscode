-- Vistaar-Biz evidence layer: preserve what was observed and what was supplied.
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
