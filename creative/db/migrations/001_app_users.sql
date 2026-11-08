-- One row per signed-in person. The id is the Neon Auth user id (neon_auth schema); no passwords or lyrics live here.
-- last_seen_at drives the "come back" reminders and the 3-month inactivity clean-up.
create table if not exists app_users (
  id           text primary key,
  email        text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
