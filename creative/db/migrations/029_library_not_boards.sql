alter table library_items add column if not exists not_boards text[] not null default '{}';
