-- Videos waiting to be made, being made, and made: one row per chosen video. The queue starts a few of each person's at a time,
-- so a big order never holds up anyone's single video. The row's id is also its credit spend's render_id and its kept render's job_id.
create table if not exists render_queue (
  id          text primary key,
  user_id     text not null references app_users (id) on delete cascade,
  -- The videos chosen together: they share one copy of the song's audio in storage.
  order_id    uuid not null,
  -- The scene and the picture choice as the browser sent them; the picture's files are read when the render starts.
  meta        jsonb not null,
  status      text not null default 'queued' check (status in ('queued', 'starting', 'running', 'done', 'failed')),
  -- The worker's job, once it took it.
  call_id     text,
  attempts    integer not null default 0,
  error       text,
  -- Kept for the browser to fetch when the person's Media was full.
  download    text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  checked_at  timestamptz,
  finished_at timestamptz
);
create index if not exists render_queue_waiting on render_queue (status, created_at);
create index if not exists render_queue_person on render_queue (user_id, status);
create index if not exists render_queue_order on render_queue (order_id);
-- Each person's next waiting videos, for the turns.
create index if not exists render_queue_next on render_queue (user_id, created_at) where status = 'queued';
