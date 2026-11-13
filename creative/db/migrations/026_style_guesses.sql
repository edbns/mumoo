-- "We think it sounds like…": how creators who did not know their genre answered the brain's guess, one count a day.
-- Only "yes" keeps the clip's print (as a 'confirmed' style print); "no" and "unsure" teach nothing and are only counted.
create table if not exists style_guess_answers (
  day    date not null default current_date,
  style  text not null,
  answer text not null check (answer in ('yes', 'no', 'unsure')),
  count  integer not null default 0,
  primary key (day, style, answer)
);
