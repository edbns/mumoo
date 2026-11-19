-- Credits (1 credit = 1 video). A person's credits are the videos their paid Polar orders bought, less the videos they used.
-- Orders are kept by Polar's order id, so an event Polar sends twice is counted once; a full refund marks the order refunded.
create table if not exists credit_orders (
  id             text primary key,
  user_id        text not null references app_users (id) on delete cascade,
  checkout_id    text,
  videos         integer not null check (videos > 0),
  amount         integer not null,
  currency       text not null,
  invoice_number text,
  status         text not null check (status in ('paid', 'refunded')),
  paid_at        timestamptz not null default now(),
  refunded_at    timestamptz
);
create index if not exists credit_orders_user on credit_orders (user_id, paid_at desc);
create index if not exists credit_orders_checkout on credit_orders (checkout_id);

-- One row per video made with a credit.
create table if not exists credit_spends (
  id         bigserial primary key,
  user_id    text not null references app_users (id) on delete cascade,
  videos     integer not null default 1 check (videos > 0),
  render_id  text,
  created_at timestamptz not null default now()
);
create index if not exists credit_spends_user on credit_spends (user_id);
