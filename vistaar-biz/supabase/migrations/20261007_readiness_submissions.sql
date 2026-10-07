-- Persist the public six-question growth readiness check.
create table if not exists readiness_submissions (
  id uuid primary key default gen_random_uuid(),
  answers jsonb not null,
  readiness_score integer not null,
  source text not null default 'website-readiness-check',
  created_at timestamptz not null default now()
);
create index if not exists readiness_submissions_created_idx on readiness_submissions(created_at desc);
alter table readiness_submissions enable row level security;
