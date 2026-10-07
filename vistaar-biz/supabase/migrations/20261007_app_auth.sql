-- Vistaar-Biz application-owned authentication.
-- No Supabase Auth / Google OAuth is required for login or registration.
-- Users, password hashes, roles and sessions live in the application database.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'user' check (role in ('admin','manager','user')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists app_users_email_unique_idx on app_users(lower(email));
create index if not exists app_users_role_idx on app_users(role,status);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists app_sessions_user_idx on app_sessions(user_id);
create index if not exists app_sessions_expires_idx on app_sessions(expires_at);

-- Remove the previous Supabase-Auth dependency from the role table.
do $$
begin
  if exists (select 1 from pg_constraint where conname='user_roles_user_id_fkey') then
    alter table user_roles drop constraint user_roles_user_id_fkey;
  end if;
exception when undefined_table then null;
end $$;

alter table user_roles add constraint user_roles_user_id_app_users_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

-- If the old auth-backed table is empty, it can now be populated from app_users
-- by the application when a role is created/changed. The application uses
-- app_users as the source of truth for authentication and authorization.
