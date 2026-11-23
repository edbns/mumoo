-- "This sounds more like…": a creator picked a style and the brain, very sure, heard a style of another genre. How they answered,
-- one count a day per pick and guess. A switch keeps the clip's print as 'corrected', a keep as the creator's pick; "not sure" keeps nothing.
create table if not exists style_check_answers (
  day     date not null default current_date,
  picked  text not null,
  guessed text not null,
  answer  text not null check (answer in ('switch', 'keep', 'unsure')),
  count   integer not null default 0,
  primary key (day, picked, guessed, answer)
);
