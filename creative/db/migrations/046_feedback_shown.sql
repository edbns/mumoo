-- "shown": a card reached the person's screen in a hand of the shelf (one row per card, told once per hand).
-- The brain learns downloads out of these, not out of plays: a template downloaded without a play still counts.
-- A refresh is now one press for the whole shelf (row_id 'shelf').
alter table brain_feedback drop constraint if exists brain_feedback_event_check;
alter table brain_feedback add constraint brain_feedback_event_check check (event in ('play', 'select', 'download', 'refresh', 'watch', 'delivered', 'shown'));
create index if not exists brain_feedback_row_when on brain_feedback (row_id, event, created_at desc);
