-- Help chat: one conversation per account. The helper answers only with replies MUMOO wrote (`netlify/lib/support.mjs`);
-- when it cannot help, or the person asks, the conversation waits for the team in Admin. Deleted with the account.
create table if not exists support_threads (
  user_id         text primary key references app_users (id) on delete cascade,
  status          text not null default 'helper' check (status in ('helper', 'waiting', 'answered')),
  -- Someone tried to make the helper talk about something else, or break its rules: shown in Admin.
  flagged         boolean not null default false,
  -- Our model is sorting the last message (a Modal call id); cleared when its answer is in.
  pending_call    text,
  pending_since   timestamptz,
  -- The person has not read the team's last reply yet.
  unread          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists support_threads_status on support_threads (status, updated_at desc);

create table if not exists support_messages (
  id          bigserial primary key,
  user_id     text not null references support_threads (user_id) on delete cascade,
  author      text not null check (author in ('person', 'helper', 'team')),
  body        text not null check (char_length(body) between 1 and 2000),
  -- Which written reply the helper gave, and whether the message was a try at breaking its rules.
  answer      text,
  flagged     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists support_messages_thread on support_messages (user_id, id);
