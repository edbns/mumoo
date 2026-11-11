-- Thermal and Halftone each keep a picture of their own (a photo, video or GIF), like Our photography does.
alter table uploads drop constraint uploads_use_check;
alter table uploads add constraint uploads_use_check check (use in ('dust', 'filter', 'riso', 'window', 'thermal', 'halftone'))
