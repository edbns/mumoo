-- Each library picture's colours (a photo, or a clip's poster), read like a song's cover (src/colour-read.mjs), so the brain can
-- match pictures to the colours a genre calls for (genre-guide.ts). Measured on our server when the picture is ready; tried three times.
alter table library_items add column if not exists colours jsonb;
alter table library_items add column if not exists colour_tries integer not null default 0;

-- How well the card's lead picture carried the song's genre colours (0..1), so Learning can tell whether matching them is worth it.
alter table brain_feedback add column if not exists colour_fit real;
