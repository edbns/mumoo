alter table uploads add column if not exists kind text not null default 'photo' check (kind in ('photo', 'motion'));
alter table uploads add column if not exists status text not null default 'ready' check (status in ('preparing', 'ready', 'failed'));
alter table uploads add column if not exists job_id text;
alter table uploads add column if not exists error text;
alter table app_users add column if not exists reminded_60_at timestamptz;
alter table app_users add column if not exists reminded_83_at timestamptz
