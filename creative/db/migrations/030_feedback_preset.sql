-- The edit preset a Directed or treatment card was cut in (edit-presets.ts), and its take, so Learning can tell which trends land.
alter table brain_feedback add column if not exists preset text;
alter table brain_feedback add column if not exists preset_take text;
