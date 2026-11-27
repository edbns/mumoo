-- Which retried emails already went, by the event id the caller gives (a sign-in event, a Polar order), so a retry sends nothing
-- twice. Only the id is kept, never the address or the letter. Rows older than a day are cleared as new ones come in.
create table if not exists mail_sent (
  key text primary key,
  at  timestamptz not null default now()
);
create index if not exists mail_sent_at on mail_sent (at);
