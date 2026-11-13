-- Genre learning: how a selected 15 s clip sounds (its CLAP print, 512 numbers) next to the style a person gave it.
-- Never the audio, the lyrics or who it was: a clip is known only by its song's hash and where the 15 s start.
-- source: picked by the creator, a suggestion they confirmed or corrected, or seeded from songs the owner labelled.
-- A clip keeps its latest answer.
create table if not exists style_prints (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  offset_ms     integer not null check (offset_ms >= 0),
  style         text not null,
  genre         text not null,
  sub_genre     text not null,
  source        text not null check (source in ('creator', 'confirmed', 'corrected', 'seeded')),
  model         text not null,
  print         real[] not null check (cardinality(print) = 512),
  unique (source_sha256, offset_ms)
);

-- How often "I don't know" was pressed, one count a day: nothing about the song.
create table if not exists style_unknowns (
  day   date primary key,
  count integer not null default 0
);
