-- An approved library item reaches the templates only when it is ready to be drawn:
--   a photo, once it is checked to be a JPEG;
--   a video or GIF, once our worker has made it a small clip (library/<id>.mp4) with a poster (library/<id>.poster.jpg).
-- `prepare_job` is the worker's job while it is working; `shots` is the clip's shots, as [start, end] in ms; `problem` says in words why an item cannot be used.
alter table library_items add column if not exists ready boolean not null default false;
alter table library_items add column if not exists prepare_job text;
alter table library_items add column if not exists shots jsonb;
alter table library_items add column if not exists problem text;
alter table library_items add column if not exists prepare_at timestamptz;
