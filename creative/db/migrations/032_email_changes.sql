-- A person changing their email: the new address and a hashed 6-digit code sent to it (netlify/lib/email-change.mjs).
-- Neon's managed sign-in does not let anyone change their email, so we confirm the new address ourselves and then change it in neon_auth."user".
create table if not exists email_changes (
  user_id   text primary key references app_users (id) on delete cascade,
  new_email text not null,
  code_hash text not null,
  attempts  integer not null default 0,
  sent_at   timestamptz not null default now()
);
