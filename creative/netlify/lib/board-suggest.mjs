import { BOARDS } from './boards.mjs';

/**
 * The board our models suggest for a library item the admin has not filed yet. Three voices:
 *   reader   the reader's choice (Qwen2.5-VL on our worker): its first board counts 1, a second one half.
 *   seen     how much SigLIP sees each board's scene in it (0..1), at half weight.
 *   learned  the boards of the filed items it looks most like (their embeddings): the admin's own taste. It counts more as the admin
 *            files more, and leads once they have filed `fullyLearned` items.
 * A suggestion is sure only when the reader is sure of the same board and the admin's filing agrees (or, before there is enough of
 * it, SigLIP does). The admin always decides: a suggestion is only filed when they file it.
 */
// Measured on the admin's first 196 filed items, each hidden in turn: 181 suggested right (80 of the 95 off Main Stage), 132 of 133 sure ones right.
export const SUGGEST = { nearest: 5, sharpness: 0.05, fullyLearned: 40, learnedWeight: 2.5, seenWeight: 0.5, second: 0.75, sureShare: 0.5 };

const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

/** Of the `nearest` filed items most like this one, each board's share of their likeness (the closest count most). */
export function learnedShares(embedding, filed) {
  const near = filed.map(other => ({ boards: other.boards, like: dot(embedding, other.embedding) }))
    .sort((a, b) => b.like - a.like).slice(0, SUGGEST.nearest);
  if (!near.length) return {};
  const weights = near.map(entry => Math.exp((entry.like - near[0].like) / SUGGEST.sharpness));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = {};
  near.forEach((entry, at) => { for (const board of entry.boards) shares[board] = (shares[board] ?? 0) + weights[at] / total; });
  return shares;
}

/**
 * `{ boards, sure }` for `item` (`embedding`, `board_odds`, `reading` as stored), against `filed` (`{ id, embedding, boards }` of the items
 * the admin filed): one board, or two when the reader names the second too (and it has half the first's score), or the filing does and it
 * is nearly as strong. Null while there is nothing to go on yet.
 */
export function suggestBoards(item, filed) {
  const reading = item.reading ?? null;
  const seen = item.board_odds ?? {};
  if (!item.embedding?.length && !reading) return null;
  const others = item.embedding?.length ? filed.filter(other => other.id !== item.id && other.embedding?.length === item.embedding.length && other.boards.length) : [];
  const shares = others.length ? learnedShares(item.embedding, others) : {};
  const learned = Math.min(1, others.length / SUGGEST.fullyLearned) * SUGGEST.learnedWeight;
  const read = {};
  (reading?.boards ?? []).forEach((board, at) => { read[board] = at === 0 ? 1 : 0.5; });
  const scored = BOARDS
    .map(board => ({ board, score: (read[board] ?? 0) + SUGGEST.seenWeight * (seen[board] ?? 0) + learned * (shares[board] ?? 0) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const [best, next] = scored;
  const second = next && (read[next.board] ? next.score >= best.score / 2 : next.score >= SUGGEST.second * best.score && (shares[next.board] ?? 0) >= 0.3);
  const mostSeen = BOARDS.reduce((top, board) => ((seen[board] ?? 0) > (seen[top] ?? 0) ? board : top), BOARDS[0]);
  const readerSure = reading?.sure === true && reading.boards[0] === best.board;
  const othersAgree = learned >= SUGGEST.learnedWeight / 2 ? (shares[best.board] ?? 0) >= SUGGEST.sureShare : mostSeen === best.board;
  return { boards: second ? [best.board, next.board] : [best.board], sure: readerSure && othersAgree };
}
