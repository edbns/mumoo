-- Depth keeps a photo of its own (with a cut-out), like Dust and Riso.
alter table uploads drop constraint uploads_use_check;
alter table uploads add constraint uploads_use_check check (use in ('dust', 'filter', 'riso', 'window', 'thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth'));
