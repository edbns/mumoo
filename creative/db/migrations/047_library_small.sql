-- A prepared library clip also gets a small copy (at most 540 wide, the same frames at the same times): the shelf streams it while a card plays.
-- The full clip stays what the cloud renders from. Older clips are given theirs by scripts/make-small-clips.mjs.
alter table library_items add column if not exists small boolean not null default false;
