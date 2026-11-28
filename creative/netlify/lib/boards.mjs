/** The mood boards' ids, as in `src/boards.ts` (a test keeps the two the same): what the admin may file an item in and a card may name. */
export const BOARDS = [
  'rave-warehouse', 'sunset-coast', 'street-concrete', 'block-party', 'luxury-flex', 'night-neon',
  'intimate-velvet', 'live-raw', 'pop-studio', 'horizon-soul', 'funny-memes',
];
/** Boards merged into another (db/migrations/059): a card a browser kept from before still names the old id. */
export const MERGED_BOARDS = {
  'main-stage': 'rave-warehouse', 'dark-warehouse': 'rave-warehouse', 'still-open': 'horizon-soul', 'sanctuary-soul': 'horizon-soul', 'heartland-dust': 'horizon-soul',
  'vhs-retro': 'night-neon', 'night-drive': 'night-neon', 'rain-blue': 'night-neon',
};
/** Boards kept out of the creatives (`apart` in `src/boards.ts`): their items are never sent to the page that deals songs' creatives. */
export const APART_BOARDS = ['funny-memes'];
