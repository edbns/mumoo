-- The free first video is once per email address, for good: deleting the account (or moving it to another address) and signing
-- up again with the address does not bring it back. Only a SHA-256 of the address is kept, never the address: lowercased, its
-- "+tag" dropped and, at Gmail, its dots too, so name+1@… and n.ame@gmail.com count as the same address.
create or replace function free_video_key(email text) returns text language sql immutable as $$
  with parts as (
    select regexp_replace(split_part(lower(trim(email)), '@', 1), '\+.*$', '') as local, split_part(lower(trim(email)), '@', 2) as domain
  )
  select encode(sha256(convert_to(
    case when domain in ('gmail.com', 'googlemail.com') then replace(local, '.', '') || '@gmail.com' else local || '@' || domain end,
    'UTF8')), 'hex')
  from parts
$$;

create table if not exists free_videos_used (
  email_key text primary key,
  used_at   timestamptz not null default now()
);
