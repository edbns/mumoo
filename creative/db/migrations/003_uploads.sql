create table if not exists uploads (
  id uuid primary key,
  user_id text not null references app_users (id) on delete cascade,
  bytes integer not null check (bytes > 0),
  rights_confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists uploads_user_created on uploads (user_id, created_at desc);
