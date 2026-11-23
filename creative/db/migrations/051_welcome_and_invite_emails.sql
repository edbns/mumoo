-- The welcome email goes once, the first time a new account is seen. Everyone who signed up before it existed counts as welcomed.
alter table app_users add column if not exists welcomed_at timestamptz;
update app_users set welcomed_at = created_at where welcomed_at is null;

-- Invites sent by email. Only the address's code (`free_video_key`) is kept, for 30 days: enough to send any address at most
-- one invite a month, whoever asks, and to hold each person to a few invites a day.
create table if not exists invite_emails (
  id         bigserial primary key,
  email_key  text not null,
  inviter_id text not null references app_users (id) on delete cascade,
  sent_at    timestamptz not null default now()
);
create index if not exists invite_emails_key on invite_emails (email_key, sent_at);
create index if not exists invite_emails_inviter on invite_emails (inviter_id, sent_at);
