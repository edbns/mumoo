-- One upload button for the whole shelf: a picture kept as `any` is drawn by every template that can use it
-- (a photo gets its cut-out made once; a video or GIF is prepared once). The per-row uses stay valid for pictures already kept.
alter table uploads drop constraint uploads_use_check;
alter table uploads add constraint uploads_use_check check (use in ('dust', 'filter', 'riso', 'window', 'thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth', 'any'));
