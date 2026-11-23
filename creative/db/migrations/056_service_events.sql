-- How each real call to a worker or to Polar went, for the status page: whether it worked and how long it took. Nothing about the
-- person or their song is kept. Rows older than a week are cleared as new ones come in.
create table if not exists service_events (
  id      bigserial primary key,
  service text not null check (service in ('analysis', 'genre', 'lyrics', 'meaning', 'checkout', 'payments')),
  ok      boolean not null,
  ms      integer not null check (ms >= 0),
  at      timestamptz not null default now()
);
create index if not exists service_events_recent on service_events (service, at desc);
