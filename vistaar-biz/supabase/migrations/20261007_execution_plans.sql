-- Persist the executable plan attached to each AI growth action.
alter table growth_actions add column if not exists steps jsonb;
alter table growth_actions add column if not exists deliverable text;
alter table growth_actions add column if not exists measurement text;
