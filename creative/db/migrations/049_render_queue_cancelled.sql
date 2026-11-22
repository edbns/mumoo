-- A waiting video the person took back before it started: its credit was given back.
alter table render_queue drop constraint if exists render_queue_status_check;
alter table render_queue add constraint render_queue_status_check
  check (status in ('queued', 'starting', 'running', 'done', 'failed', 'cancelled'));
