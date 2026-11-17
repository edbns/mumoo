-- Smart links: every song looked up from a pasted Spotify, Apple Music or YouTube link, kept so each is looked up once.
-- `source` is "platform:id" (spotify:…, apple:…, youtube:…); `song` is what `lookupSong` found.
create table if not exists song_lookups (
  source text primary key,
  song jsonb not null,
  looked_up_at timestamptz not null default now()
);
