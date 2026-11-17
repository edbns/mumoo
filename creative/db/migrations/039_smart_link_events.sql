-- Smart link analytics: one row per fan page visit or button press, for the artist's dashboard. Where the fan was (country, from
-- Netlify), what they used (browser, device, operating system, from the user agent), where they came from (campaign tags or the
-- referring site) and whether it was a paid ad. No IP address, user agent, cookie or click ID is kept: those only go on to the
-- artist's own Meta / TikTok accounts when they set them up. Deleted with the link, and so with the account.
create table if not exists smart_link_events (
  id           bigint generated always as identity primary key,
  slug         text not null references smart_links (slug) on delete cascade,
  kind         text not null check (kind in ('view', 'click')),
  service      text,
  at           timestamptz not null default now(),
  country      text,
  browser      text,
  device       text,
  os           text,
  is_paid_ad   boolean not null default false,
  ad_network   text check (ad_network in ('meta', 'tiktok', 'google')),
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  referrer     text
);
create index if not exists smart_link_events_slug_at on smart_link_events (slug, at);

-- The artist's own ad accounts, per link, for forwarding visits and clicks server-side (Meta Conversions API, TikTok Events API).
-- The two tokens are encrypted (netlify/lib/secret-box.mjs) and never sent back to the browser.
alter table smart_links add column if not exists meta_pixel_id text;
alter table smart_links add column if not exists meta_capi_token text;
alter table smart_links add column if not exists tiktok_pixel_id text;
alter table smart_links add column if not exists tiktok_events_token text;
alter table smart_links add column if not exists google_ads_id text;
