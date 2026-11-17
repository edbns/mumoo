-- Smart links: a published fan page at /l/<slug>. `link` is what the artist made in the editor (netlify/lib/smart-links.mjs):
-- the pasted song link, title, artist, cover, preview and the service buttons in their order. Deleted with the account.
create table if not exists smart_links (
  slug       text primary key,
  user_id    text not null references app_users (id) on delete cascade,
  link       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smart_links_user on smart_links (user_id, created_at desc);
