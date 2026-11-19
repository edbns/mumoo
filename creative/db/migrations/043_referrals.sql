-- Referrals: give 10, get 10. A friend who signs up with someone's link gets 10 extra videos on their first paid pack, and the
-- person who invited them gets 10 once that payment is in (at most `referral_cap`, default 20, rewards a calendar month).
alter table app_users add column if not exists referral_code text;
create unique index if not exists app_users_referral_code on app_users (referral_code);
-- Raised by hand for someone who shares MUMOO widely; null is the usual cap.
alter table app_users add column if not exists referral_cap integer check (referral_cap >= 0);

-- One row per friend: who invited them, the first paid order that counted, and whether the inviter was rewarded for it.
create table if not exists referrals (
  friend_id   text primary key references app_users (id) on delete cascade,
  referrer_id text not null references app_users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  order_id    text,
  rewarded_at timestamptz,
  check (friend_id <> referrer_id)
);
create index if not exists referrals_referrer on referrals (referrer_id, rewarded_at);

-- Videos given rather than bought. They count as credits like a paid order's, and a full refund of the order revokes them.
create table if not exists credit_bonuses (
  id         bigserial primary key,
  user_id    text not null references app_users (id) on delete cascade,
  videos     integer not null check (videos > 0),
  reason     text not null check (reason in ('referred', 'referral')),
  order_id   text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, reason, order_id)
);
create index if not exists credit_bonuses_order on credit_bonuses (order_id);
