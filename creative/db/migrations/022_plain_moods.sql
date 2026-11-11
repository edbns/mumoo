-- Eighteen attitudes became nine plain moods plus neutral, each one you can see in a picture:
-- happy, fun, flirty, love, confident, angry, sad, thoughtful, spiritual, neutral (ATTITUDES in src/lyric-meaning.ts).
-- Every old code is folded into its new one, so no library item has to be tagged again.
create or replace function pg_temp.plain_mood(code text) returns text language sql immutable as $$
  select case code
    when 'joyful' then 'happy' when 'hopeful' then 'happy' when 'playful' then 'fun'
    when 'tender' then 'love' when 'romantic' then 'love' when 'boastful' then 'confident' when 'defiant' then 'confident'
    when 'annoyed' then 'angry' when 'bitter' then 'angry' when 'menacing' then 'angry'
    when 'heartbroken' then 'sad' when 'lonely' then 'sad' when 'nostalgic' then 'thoughtful' when 'reflective' then 'thoughtful'
    else code end
$$;

update library_items set attitudes = coalesce((
  select array_agg(code order by first)
  from (select pg_temp.plain_mood(a.code) as code, min(a.at) as first from unnest(library_items.attitudes) with ordinality as a(code, at) group by 1) folded
), '{}')
where exists (select 1 from unnest(attitudes) as a(code) where pg_temp.plain_mood(code) <> code);

update brain_feedback set attitude = pg_temp.plain_mood(attitude) where attitude is not null and pg_temp.plain_mood(attitude) <> attitude;
