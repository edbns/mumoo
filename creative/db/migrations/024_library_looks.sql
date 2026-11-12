-- What our own vision model sees in a library item: how strongly it shows each look the brain asks for (0..1), and tags to suggest to the admin.
alter table library_items add column if not exists looks jsonb;
alter table library_items add column if not exists seen text[] not null default '{}';
alter table library_items add column if not exists look_tries integer not null default 0;
