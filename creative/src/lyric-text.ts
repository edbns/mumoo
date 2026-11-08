/** Pure text helpers for lyrics in any script. No browser APIs, so the brain and the tests can use them. */

/** Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const EDGE_PUNCTUATION = /^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu;

/** Split one line of lyrics into words the aligner can place. Works for spaced and unspaced scripts. */
function tokenizeLine(line: string): string[] {
  if (UNSPACED.test(line) && typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(line))
      .filter(part => part.isWordLike)
      .map(part => part.segment.trim())
      .filter(Boolean);
  }
  return line.split(/\s+/u).map(word => word.replace(EDGE_PUNCTUATION, '')).filter(Boolean);
}

/** Lines of words from the editor text. Blank lines are ignored. */
export function tokenizeLyrics(text: string): string[][] {
  return text.split(/\r?\n/u).map(tokenizeLine).filter(line => line.length > 0);
}

/** Join words for display without inventing spaces inside unspaced scripts. */
export function joinWords(words: readonly string[]): string {
  let out = '';
  for (const word of words) {
    if (out && !(UNSPACED.test(out.slice(-1)) && UNSPACED.test(word[0]))) out += ' ';
    out += word;
  }
  return out;
}
