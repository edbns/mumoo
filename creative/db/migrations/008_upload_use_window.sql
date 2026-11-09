alter table uploads drop constraint uploads_use_check;
alter table uploads add constraint uploads_use_check check (use in ('dust', 'filter', 'riso', 'window'))
