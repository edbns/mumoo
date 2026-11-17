-- Smart link traffic sources: clicks are also counted by where the visit came from (a category such as "meta_ads", read from the
-- page's campaign tags and click IDs, never the tag or ID itself), and page opens are counted the same way. Still only counts.
alter table smart_link_clicks add column if not exists source text not null default 'direct';
alter table smart_link_clicks drop constraint if exists smart_link_clicks_pkey;
alter table smart_link_clicks add primary key (slug, service, day, source);

create table if not exists smart_link_views (
  slug   text not null references smart_links (slug) on delete cascade,
  source text not null,
  day    date not null default current_date,
  views  integer not null default 0,
  primary key (slug, source, day)
);
