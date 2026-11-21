/**
 * The key word of a lyric line: the one word a two-tone or mixed-serif card sets apart. A pure function of the line's words
 * (no request, no model), so the shelf and the cloud render pick the same word, and every song already analysed has one.
 *
 * The word that carries the line is a content word, not a small word or a vocal sound: the longest one, with a lift for a
 * word sung in capitals, a word sung twice and the line's last word (where a line lands). Ties go to the later word.
 */

/** Small words and vocal sounds of the languages our songs are sung in most (English, Spanish, Portuguese, French). */
const SMALL = new Set(`
a an the and or but so if of to in on at by for from with into onto as is am are was were be been being do does did
i me my mine you your yours he him his she her hers it its we us our they them their this that these those there here
not no yes just all can cant could would should will wont im youre its dont doesnt didnt got get gonna wanna gotta
what when where who why how up down out off over now then than too very oh ooh ohh ah aah eh hey yeah yea ya yo uh
la na da mm hmm woah whoa baby
el la los las un una unos unas y o pero que de del al en con por para sin se te me le lo les mi mis tu tus su sus
yo tú tu él ella nos nosotros ustedes ellos es son fue era soy eres estoy está esta estas estás muy más mas ya si sí no
como cuando donde porque pa pal
o os as um uma e mas de do da dos das no na nos nas em com por pra pro sem se eu você voce ele ela nós nos eles elas
meu minha seu sua é foi era sou tá ta estou mais já ja sim não nao quando onde porque
le les un une des et ou mais de du au aux en avec pour sans je tu il elle nous vous ils elles mon ma mes ton ta tes son
sa ses est suis es était c ce ça ca qui que quand où ou pas plus très tres oui non
`.split(/\s+/).filter(Boolean));

const letters = (text: string) => text.normalize('NFC').replace(/[^\p{L}\p{N}']/gu, '').replace(/'/g, '');

/** The index in `words` of the line's key word, or -1 when the line has no word worth setting apart (fewer than two words, or none but small ones). */
export function keywordOf(words: readonly { text: string }[]): number {
  if (words.length < 2) return -1;
  const plain = words.map(word => letters(word.text));
  const folded = plain.map(word => word.toLocaleLowerCase());
  let best = -1;
  let bestScore = 0;
  folded.forEach((word, index) => {
    if (word.length < 3 || SMALL.has(word) || SMALL.has(word.normalize('NFD').replace(/\p{M}/gu, ''))) return;
    const shouted = plain[index].length >= 3 && plain[index] === plain[index].toLocaleUpperCase() && words.some(other => letters(other.text) !== letters(other.text).toLocaleUpperCase());
    const repeated = folded.filter(other => other === word).length > 1;
    const score = Math.min(word.length, 10) + (shouted ? 3 : 0) + (repeated ? 3 : 0) + (index === words.length - 1 ? 1.5 : 0);
    if (score >= bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}
