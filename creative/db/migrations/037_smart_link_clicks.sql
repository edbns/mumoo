-- Smart link clicks: how many times each button of a fan page was pressed, per day. Only the count: nothing about the fan
-- (no address, device, cookie or time of day). Goes with its link, and so with the account.
create table if not exists smart_link_clicks (
  slug    text not null references smart_links (slug) on delete cascade,
  service text not null,
  day     date not null default current_date,
  clicks  integer not null default 0,
  primary key (slug, service, day)
);
