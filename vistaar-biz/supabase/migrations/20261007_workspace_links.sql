-- Vistaar-Biz workspace relationship migration
-- Safe to run on an existing Supabase database.
alter table growth_assessments
  add column if not exists business_id uuid references businesses(id) on delete set null;

alter table growth_assessments
  add column if not exists audit_id uuid references growth_audits(id) on delete set null;

create index if not exists growth_assessments_business_idx
  on growth_assessments(business_id, created_at desc);
