-- Spending credits: a render takes one when it starts (render_id is empty until the worker accepts the job, and a reservation
-- left empty is dropped after a while). Every account's first video is free: one free row each, at most.
alter table credit_spends add column if not exists free boolean not null default false;
create unique index if not exists credit_spends_render on credit_spends (render_id) where render_id is not null;
create unique index if not exists credit_spends_one_free on credit_spends (user_id) where free;
