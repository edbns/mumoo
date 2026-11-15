-- What our models make of a library item for its board: its likeness (SigLIP's embedding, compared with the items the admin filed),
-- how much it looks like each board (0..1), and the reader's sentence and board choice. Every item is looked at once more to get them.
alter table library_items add column if not exists embedding real[];
alter table library_items add column if not exists board_odds jsonb;
alter table library_items add column if not exists reading jsonb;
update library_items set look_tries = 0 where reading is null;
