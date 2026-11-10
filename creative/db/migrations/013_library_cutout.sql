-- A library photo can also be drawn by Riso and Dust, which need the subject cut out of it (library/<id>.cut.png, made by our worker).
-- `cutout` says the cut-out exists; `cutout_tries` stops a photo the worker cannot cut from being tried for ever.
alter table library_items add column if not exists cutout boolean not null default false;
alter table library_items add column if not exists cutout_tries integer not null default 0;
