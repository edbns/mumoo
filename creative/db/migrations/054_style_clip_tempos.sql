-- The song reader's tempo and loudness of a selected clip, beside its sound print (joined by clip): kept so tempo and energy can be
-- measured as nudges to the genre guess (a half- or double-time reading, trap read as 70) before they are used. Nothing else of the song.
create table if not exists style_clip_tempos (
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  offset_ms     integer not null check (offset_ms >= 0),
  bpm           real check (bpm is null or (bpm > 0 and bpm <= 400)),
  energy        real check (energy is null or (energy >= 0 and energy <= 1)),
  created_at    timestamptz not null default now(),
  primary key (source_sha256, offset_ms)
);
