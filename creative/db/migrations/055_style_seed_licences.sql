-- What each seeded file (CC0 or owned loops, stems and songs) was licensed under, by its hash, so every seeded print can be
-- traced to its permission. No name and no audio of the file is kept.
create table if not exists style_seed_licences (
  source_sha256 text primary key check (source_sha256 ~ '^[a-f0-9]{64}$'),
  licence       text not null check (length(licence) between 1 and 200),
  created_at    timestamptz not null default now()
);
