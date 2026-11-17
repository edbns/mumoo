-- When we last wrote that someone's storage is almost full; cleared once they have made room, so the next time warns again.
alter table app_users add column if not exists storage_warned_at timestamptz;
