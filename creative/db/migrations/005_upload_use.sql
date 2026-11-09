alter table uploads add column if not exists use text not null default 'filter' check (use in ('dust', 'filter'))
