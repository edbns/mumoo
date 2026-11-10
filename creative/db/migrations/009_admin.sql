-- The approved library: photos, videos and GIFs the admin has cleared for the creatives to use. Only the admin adds or sees them.
-- A new item starts as 'pending' (uploaded, not yet approved); only 'approved' items are ever offered to the templates.
-- attitudes are the brain's own codes (see ATTITUDES in src/lyric-meaning.ts); tags are the small shared pool in library_tags.
-- genre / sub_genre are optional: an item that has them is preferred for that genre, one without is free for any.
-- cleared_by and cleared_at record who confirmed the rights to the file and when; source_note says where it came from.
create table if not exists library_items (
  id           uuid primary key,
  kind         text not null check (kind in ('photo', 'video', 'gif')),
  content_type text not null,
  bytes        integer not null check (bytes > 0),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  attitudes    text[] not null default '{}',
  tags         text[] not null default '{}',
  genre        text,
  sub_genre    text,
  source_note  text not null default '',
  cleared_by   text not null,
  cleared_at   timestamptz not null default now(),
  arrived      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists library_items_status on library_items (status, created_at desc);

-- The whole vocabulary of tags. Kept short on purpose, so the brain decides fast.
create table if not exists library_tags (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- What went wrong, for the admin to read: a render, a download or a sign-in that failed.
-- user_id and email are empty when nobody was signed in; an email typed into a failed sign-in is unchecked.
create table if not exists problems (
  id         bigserial primary key,
  kind       text not null check (kind in ('render', 'download', 'sign_in')),
  user_id    text,
  email      text,
  message    text not null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists problems_unseen on problems (seen_at, created_at desc);
