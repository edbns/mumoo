-- Genre learning from the public waits here before the brain may use it (`style-learning.mjs`): a creator's pick, or a guess
-- they confirmed or corrected, with the clip's print. A daily check moves an answer into style_prints only when the brain
-- already hears it or several accounts gave the song the same genre, and only if the brain does not get worse on known songs.
-- voter: a code made from the account and the song together, so one account is one voice per song; the same account gets
-- another code on every other song, and no code leads back to an account. Null when nobody was signed in (never counted
-- as a voice). status: waiting, accepted (kept, or already known), held (for a person to look at) or rejected (never confirmed).
create table if not exists style_print_candidates (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  offset_ms     integer not null check (offset_ms >= 0),
  style         text not null,
  genre         text not null,
  sub_genre     text not null,
  source        text not null check (source in ('creator', 'confirmed', 'corrected')),
  voter         text check (voter ~ '^[a-f0-9]{64}$'),
  model         text not null,
  print         real[] not null check (cardinality(print) = 512),
  status        text not null default 'waiting' check (status in ('waiting', 'accepted', 'held', 'rejected')),
  reason        text,
  decided_at    timestamptz
);

create unique index if not exists style_print_candidates_voice on style_print_candidates (source_sha256, voter) where voter is not null;
create unique index if not exists style_print_candidates_unsigned on style_print_candidates (source_sha256, offset_ms) where voter is null;
create index if not exists style_print_candidates_waiting on style_print_candidates (created_at) where status = 'waiting';
