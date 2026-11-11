-- Glow keeps a picture of its own (a photo, video or GIF), like Thermal, Halftone and Dither do.
alter table uploads drop constraint uploads_use_check;
alter table uploads add constraint uploads_use_check check (use in ('dust', 'filter', 'riso', 'window', 'thermal', 'halftone', 'dither', 'glow'));
