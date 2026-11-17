-- Where the card's template was on the shelf (0 is the top). The shelf's order is now learned (shelfOrder in creatives-pack.ts),
-- and a template near the top gets played more just for being there: Learning reads downloads against the place they came from.
alter table brain_feedback add column if not exists shelf_place smallint;
