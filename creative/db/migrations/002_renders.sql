create table if not exists renders (
  id uuid primary key,
  user_id text not null references app_users (id) on delete cascade,
  job_id text not null,
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index if not exists renders_user_created on renders (user_id, created_at desc);
