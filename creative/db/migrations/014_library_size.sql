-- The picture size of a library item, so the admin can be warned when it is too small for sharp creatives (they are 1080x1920).
alter table library_items add column if not exists width integer;
alter table library_items add column if not exists height integer;
