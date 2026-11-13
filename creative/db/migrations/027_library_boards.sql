-- Mood boards (src/boards.ts): the admin files library media into boards, each one look; the brain deals a shelf row from one board.
-- An item may sit in several boards. Unfiled items are still used while a song has no filled board.
alter table library_items add column if not exists boards text[] not null default '{}';

-- The board a card was dealt from, so what people keep and skip can be read per board and genre.
alter table brain_feedback add column if not exists board text;
