import { db } from './person.mjs';

/** Each person's storage: their finished creatives and their uploaded photos share one allowance. */
export const QUOTA_BYTES = 5_000_000_000;

export async function usedBytes(userId) {
  const [{ used }] = await db()`
    select (coalesce((select sum(bytes) from renders where user_id = ${userId}), 0)
          + coalesce((select sum(bytes) from uploads where user_id = ${userId}), 0))::float8 as used`;
  return used;
}

export async function hasRoom(userId, bytes) {
  return (await usedBytes(userId)) + bytes <= QUOTA_BYTES;
}
