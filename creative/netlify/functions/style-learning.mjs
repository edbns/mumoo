import { promote, summary } from '../lib/style-learning.mjs';
import { thisSite } from '../lib/sites.mjs';

/** Once a day: the oldest genre answers that waited are let into the brain, held or rejected (`style-learning.mjs`). Each site learns into its own database. */
export default async function styleLearning() {
  if (!thisSite() || !process.env.DATABASE_URL) return;
  const result = await promote({ write: true });
  console.log(`style-learning: ${summary(result)}`);
}

export const config = { schedule: '@daily' };
