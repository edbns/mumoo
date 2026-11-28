-- Mood boards merged (src/boards.ts): Main Stage and Dark Warehouse are Rave, Strobes & Warehouse; Still & Open, Sanctuary & Soul and
-- Heartland & Dust are Horizon, Still & Soul; VHS & Retro, Night Drive and Rain & Blue Hour are Night Drive, Neon & Lo-Fi. Every place an item or a card names a board takes the new id, each board once, in its first place.
-- An item filed on the merged board is no longer turned down for it, and the reader's other boards leave out the ones it is filed on.
update library_items set boards = array(
  select coalesce(merged.new, filed.board) from unnest(boards) with ordinality as filed (board, place)
  left join (values ('main-stage', 'rave-warehouse'), ('dark-warehouse', 'rave-warehouse'), ('still-open', 'horizon-soul'), ('sanctuary-soul', 'horizon-soul'), ('heartland-dust', 'horizon-soul'), ('vhs-retro', 'night-neon'), ('night-drive', 'night-neon'), ('rain-blue', 'night-neon')) as merged (old, new) on merged.old = filed.board
  group by 1 order by min(filed.place))
where boards && array['main-stage', 'dark-warehouse', 'still-open', 'sanctuary-soul', 'heartland-dust', 'vhs-retro', 'night-drive', 'rain-blue'];

update library_items set not_boards = array(
  select coalesce(merged.new, refused.board) from unnest(not_boards) with ordinality as refused (board, place)
  left join (values ('main-stage', 'rave-warehouse'), ('dark-warehouse', 'rave-warehouse'), ('still-open', 'horizon-soul'), ('sanctuary-soul', 'horizon-soul'), ('heartland-dust', 'horizon-soul'), ('vhs-retro', 'night-neon'), ('night-drive', 'night-neon'), ('rain-blue', 'night-neon')) as merged (old, new) on merged.old = refused.board
  where coalesce(merged.new, refused.board) <> all (boards)
  group by 1 order by min(refused.place))
where not_boards && array['main-stage', 'dark-warehouse', 'still-open', 'sanctuary-soul', 'heartland-dust', 'vhs-retro', 'night-drive', 'rain-blue'];

update library_items set board_odds = (
  select jsonb_object_agg(board, odds) from (
    select coalesce(merged.new, seen.key) as board, max((seen.value #>> '{}')::numeric) as odds from jsonb_each(board_odds) as seen
    left join (values ('main-stage', 'rave-warehouse'), ('dark-warehouse', 'rave-warehouse'), ('still-open', 'horizon-soul'), ('sanctuary-soul', 'horizon-soul'), ('heartland-dust', 'horizon-soul'), ('vhs-retro', 'night-neon'), ('night-drive', 'night-neon'), ('rain-blue', 'night-neon')) as merged (old, new) on merged.old = seen.key
    group by 1) as odds)
where jsonb_typeof(board_odds) = 'object' and board_odds ?| array['main-stage', 'dark-warehouse', 'still-open', 'sanctuary-soul', 'heartland-dust', 'vhs-retro', 'night-drive', 'rain-blue'];

update library_items set reading = reading || jsonb_build_object(
  'boards', (
    select coalesce(jsonb_agg(board order by place), '[]'::jsonb) from (
      select coalesce(merged.new, named.board) as board, min(named.place) as place from jsonb_array_elements_text(coalesce(reading->'boards', '[]'::jsonb)) with ordinality as named (board, place)
      left join (values ('main-stage', 'rave-warehouse'), ('dark-warehouse', 'rave-warehouse'), ('still-open', 'horizon-soul'), ('sanctuary-soul', 'horizon-soul'), ('heartland-dust', 'horizon-soul'), ('vhs-retro', 'night-neon'), ('night-drive', 'night-neon'), ('rain-blue', 'night-neon')) as merged (old, new) on merged.old = named.board
      group by 1) as best),
  'also', (
    select coalesce(jsonb_agg(board order by place), '[]'::jsonb) from (
      select coalesce(merged.new, named.board) as board, min(named.place) as place from jsonb_array_elements_text(coalesce(reading->'also', '[]'::jsonb)) with ordinality as named (board, place)
      left join (values ('main-stage', 'rave-warehouse'), ('dark-warehouse', 'rave-warehouse'), ('still-open', 'horizon-soul'), ('sanctuary-soul', 'horizon-soul'), ('heartland-dust', 'horizon-soul'), ('vhs-retro', 'night-neon'), ('night-drive', 'night-neon'), ('rain-blue', 'night-neon')) as merged (old, new) on merged.old = named.board
      group by 1) as other
    where not exists (
      select 1 from jsonb_array_elements_text(coalesce(reading->'boards', '[]'::jsonb)) as best (board)
      left join (values ('main-stage', 'rave-warehouse'), ('dark-warehouse', 'rave-warehouse'), ('still-open', 'horizon-soul'), ('sanctuary-soul', 'horizon-soul'), ('heartland-dust', 'horizon-soul'), ('vhs-retro', 'night-neon'), ('night-drive', 'night-neon'), ('rain-blue', 'night-neon')) as merged (old, new) on merged.old = best.board
      where coalesce(merged.new, best.board) = other.board)))
where jsonb_typeof(reading) = 'object'
  and (coalesce(reading->'boards', '[]'::jsonb) ?| array['main-stage', 'dark-warehouse', 'still-open', 'sanctuary-soul', 'heartland-dust', 'vhs-retro', 'night-drive', 'rain-blue']
    or coalesce(reading->'also', '[]'::jsonb) ?| array['main-stage', 'dark-warehouse', 'still-open', 'sanctuary-soul', 'heartland-dust', 'vhs-retro', 'night-drive', 'rain-blue']);

-- What people did with cards dealt from the old boards counts for the merged one.
update brain_feedback set board = case when board in ('main-stage', 'dark-warehouse') then 'rave-warehouse'
  when board in ('vhs-retro', 'night-drive', 'rain-blue') then 'night-neon' else 'horizon-soul' end
where board in ('main-stage', 'dark-warehouse', 'still-open', 'sanctuary-soul', 'heartland-dust', 'vhs-retro', 'night-drive', 'rain-blue');
