-- What the brain learns from, told more fully.
-- watch      a card's preview stopped playing; watch_ms is how long it was watched.
-- delivered  a downloaded creative reached the person (the file was handed over), not just the Download press.
--            The song and the card are copied from that card's own download row, so the browser only says which cards.
-- reel_ids   every library picture a Director's reel was edited from, in its order (library_id stays the one it opens on).
-- cut_seed   the Director's seed for the card: with the song and the reel it remakes the same edit (its temper, its cuts).
-- lyric_moods, lyric_themes, drive, mode: the fuller reading of the song (codes and numbers only, never words).
alter table brain_feedback drop constraint if exists brain_feedback_event_check;
alter table brain_feedback add constraint brain_feedback_event_check check (event in ('play', 'select', 'download', 'refresh', 'watch', 'delivered'));
alter table brain_feedback add column if not exists reel_ids text[];
alter table brain_feedback add column if not exists cut_seed integer;
alter table brain_feedback add column if not exists watch_ms integer;
alter table brain_feedback add column if not exists lyric_moods text[];
alter table brain_feedback add column if not exists lyric_themes text[];
alter table brain_feedback add column if not exists drive real;
alter table brain_feedback add column if not exists mode text;
create index if not exists brain_feedback_library on brain_feedback (library_id, event) where library_id is not null;
create index if not exists brain_feedback_reel on brain_feedback using gin (reel_ids) where reel_ids is not null;
