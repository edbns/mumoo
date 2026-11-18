-- Every account's member number, shown on /welcome as 0001, 0002, …: given in the order people joined, never reused
-- (a deleted account's number stays gone), so a person's number never changes.
create sequence if not exists app_users_member_no_seq;
alter table app_users add column if not exists member_no bigint;
update app_users set member_no = ranked.n
  from (select id, row_number() over (order by created_at, id) as n from app_users) as ranked
  where app_users.id = ranked.id and app_users.member_no is null;
select setval('app_users_member_no_seq', greatest(1, (select coalesce(max(member_no), 0) from app_users)), exists (select 1 from app_users));
alter table app_users alter column member_no set default nextval('app_users_member_no_seq');
alter sequence app_users_member_no_seq owned by app_users.member_no;
create unique index if not exists app_users_member_no_key on app_users (member_no);
