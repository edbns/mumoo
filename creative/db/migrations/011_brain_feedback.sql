-- What people do with the creatives, kept so the brain can be tuned from real use.
-- One row per action: play, select (into the cart), download (the Download press) and refresh (a row was rolled again).
-- Only codes are kept, never lyrics: the song's genre, vibe, lane, the attitude, sadness and intensity read from its words,
-- and the card (row, style, font, type, effect or library picture) the action was about.
-- user_id is set only when the person was signed in; deleting the account keeps the row but forgets whose it was.
-- nth_download counts that person's download presses (1 = their first, the free one); it is empty for downloads by nobody signed in.
create table if not exists brain_feedback (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  event         text not null check (event in ('play', 'select', 'download', 'refresh')),
  user_id       text references app_users (id) on delete set null,
  nth_download  integer,
  clip_sha256   text not null,
  genre         text not null,
  sub_genre     text,
  vibe          text,
  lane          text not null,
  language      text,
  lyrics_origin text,
  attitude      text,
  sadness       smallint,
  intensity     smallint,
  row_id        text,
  slot_id       text,
  style         text,
  font          text,
  font_secondary text,
  type_style    text,
  effect_id     text,
  library_id    text,
  own_picture   boolean,
  generation    integer
);
create index if not exists brain_feedback_when on brain_feedback (created_at desc);
create index if not exists brain_feedback_user on brain_feedback (user_id, event, created_at);
create index if not exists brain_feedback_card on brain_feedback (event, row_id, style);
