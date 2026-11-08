import { FPS, FRAMES, type LyricCue } from './composition';
import { phrasesFor } from './lyric-motion';
import type { MoodLane } from './ad-fonts';

/**
 * Brain v1 — reads what the song SAYS, not just how it sounds.
 * Word lists per language (English, Portuguese, Spanish, French). A word list is a heuristic: it only nudges the lane,
 * and genre locks (gospel / club genres) still win. For any other language the result says so (`read: false`)
 * and the audio decides alone; swap in a multilingual model later without changing callers.
 */
export type LyricTheme = 'faith' | 'sorrow' | 'love' | 'party' | 'rage' | 'neutral';
type Lexicon = Record<Exclude<LyricTheme, 'neutral'>, readonly string[]>;

// Words are compared lower-case with accents removed, so "coração" matches "coracao".
const LEXICONS: Record<string, Lexicon> = {
  en: {
    faith: ['god', 'lord', 'jesus', 'christ', 'grace', 'praise', 'worship', 'holy', 'heaven', 'spirit', 'amen', 'hallelujah',
      'blessed', 'bless', 'savior', 'faith', 'pray', 'prayer', 'angel', 'glory', 'mercy', 'cross', 'redeemed', 'hosanna', 'king'],
    sorrow: ['cry', 'crying', 'tears', 'alone', 'lonely', 'lost', 'goodbye', 'pain', 'hurt', 'broken', 'miss', 'gone', 'empty',
      'sorry', 'cold', 'grave', 'died', 'dying', 'sad', 'rain', 'dark', 'fade', 'ghost', 'regret', 'bleed'],
    love: ['love', 'heart', 'kiss', 'baby', 'darling', 'honey', 'forever', 'mine', 'touch', 'hold', 'together', 'beautiful',
      'angel', 'sweet', 'romance', 'yours', 'lover'],
    party: ['party', 'dance', 'dancing', 'club', 'tonight', 'jump', 'move', 'shake', 'drink', 'wild', 'fire', 'light', 'lights',
      'turn', 'up', 'go', 'ride', 'summer', 'bounce', 'nightlife', 'vibe', 'energy'],
    rage: ['war', 'kill', 'blood', 'fight', 'hate', 'rage', 'burn', 'enemy', 'scream', 'destroy', 'rise', 'revenge', 'chain',
      'money', 'gun', 'smoke', 'demon', 'hell', 'storm', 'thunder'],
  },
  pt: {
    faith: ['deus', 'senhor', 'jesus', 'cristo', 'graca', 'louvor', 'louvar', 'adoracao', 'adorar', 'santo', 'ceu', 'espirito',
      'amem', 'aleluia', 'abencoado', 'bencao', 'salvador', 'fe', 'oracao', 'orar', 'anjo', 'gloria', 'misericordia', 'cruz', 'rei'],
    sorrow: ['chorar', 'choro', 'lagrimas', 'sozinho', 'sozinha', 'solidao', 'perdido', 'adeus', 'dor', 'machucar', 'quebrado',
      'saudade', 'ido', 'vazio', 'perdao', 'frio', 'morte', 'morrer', 'triste', 'chuva', 'escuro', 'fantasma', 'sangrar'],
    love: ['amor', 'coracao', 'beijo', 'amada', 'amado', 'querida', 'querido', 'paixao', 'juntos', 'linda', 'lindo', 'doce',
      'sempre', 'vem', 'abraco', 'meu', 'minha'],
    party: ['festa', 'danca', 'dancar', 'balada', 'pular', 'beber', 'noite', 'fogo', 'luz', 'luzes', 'verao', 'rebolar', 'energia'],
    rage: ['guerra', 'matar', 'sangue', 'luta', 'odio', 'raiva', 'queimar', 'inimigo', 'gritar', 'destruir', 'vinganca', 'arma',
      'inferno', 'tempestade', 'trovao'],
  },
  es: {
    faith: ['dios', 'senor', 'jesus', 'cristo', 'gracia', 'alabanza', 'alabar', 'adorar', 'adoracion', 'santo', 'cielo', 'espiritu',
      'amen', 'aleluya', 'bendito', 'bendicion', 'salvador', 'fe', 'oracion', 'orar', 'angel', 'gloria', 'misericordia', 'cruz', 'rey'],
    sorrow: ['llorar', 'llanto', 'lagrimas', 'solo', 'sola', 'soledad', 'perdido', 'adios', 'dolor', 'herido', 'roto', 'extrano',
      'vacio', 'perdon', 'frio', 'muerte', 'morir', 'triste', 'lluvia', 'oscuro', 'fantasma', 'sangrar'],
    love: ['amor', 'corazon', 'beso', 'carino', 'querida', 'querido', 'pasion', 'juntos', 'bella', 'bello', 'dulce', 'siempre',
      'abrazo', 'mio', 'mia', 'ven'],
    party: ['fiesta', 'baile', 'bailar', 'discoteca', 'saltar', 'beber', 'noche', 'fuego', 'luz', 'luces', 'verano', 'perrear', 'energia'],
    rage: ['guerra', 'matar', 'sangre', 'lucha', 'odio', 'rabia', 'quemar', 'enemigo', 'gritar', 'destruir', 'venganza', 'arma',
      'infierno', 'tormenta', 'trueno'],
  },
  fr: {
    faith: ['dieu', 'seigneur', 'jesus', 'christ', 'grace', 'louange', 'louer', 'adorer', 'adoration', 'saint', 'ciel', 'esprit',
      'amen', 'alleluia', 'beni', 'benediction', 'sauveur', 'foi', 'priere', 'prier', 'ange', 'gloire', 'misericorde', 'croix', 'roi'],
    sorrow: ['pleurer', 'larmes', 'seul', 'seule', 'solitude', 'perdu', 'adieu', 'douleur', 'blesse', 'brise', 'manque', 'vide',
      'pardon', 'froid', 'mort', 'mourir', 'triste', 'pluie', 'sombre', 'fantome', 'saigner'],
    love: ['amour', 'coeur', 'baiser', 'bebe', 'cheri', 'cherie', 'passion', 'ensemble', 'belle', 'beau', 'douce',
      'toujours', 'viens', 'etreinte', 'mien'],
    party: ['fete', 'danse', 'danser', 'boite', 'sauter', 'boire', 'nuit', 'feu', 'lumiere', 'lumieres', 'ete', 'energie'],
    rage: ['guerre', 'tuer', 'sang', 'combat', 'haine', 'rage', 'bruler', 'ennemi', 'crier', 'detruire', 'vengeance', 'arme',
      'enfer', 'tempete', 'tonnerre'],
  },
};

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase();

const WORD_TO_THEME = new Map<string, Map<string, LyricTheme>>();
for (const [language, lexicon] of Object.entries(LEXICONS)) {
  const table = new Map<string, LyricTheme>();
  for (const theme of Object.keys(lexicon) as Exclude<LyricTheme, 'neutral'>[]) {
    for (const word of lexicon[theme]) if (!table.has(fold(word))) table.set(fold(word), theme);
  }
  WORD_TO_THEME.set(language, table);
}

export type LyricMood = {
  theme: LyricTheme;
  confidence: number;
  hits: number;
  /** False when we have no word list for this language, so the lyrics could not inform the mood. */
  read: boolean;
};

/** `language` is an ISO 639 code from the lyrics step; unknown or missing is treated as English. */
export function lyricMood(cues: readonly Pick<LyricCue, 'text'>[], language = 'en'): LyricMood {
  const table = WORD_TO_THEME.get(language.toLowerCase().split('-')[0]);
  if (!table) return { theme: 'neutral', confidence: 0, hits: 0, read: false };
  const scores: Record<LyricTheme, number> = { faith: 0, sorrow: 0, love: 0, party: 0, rage: 0, neutral: 0 };
  let total = 0;
  for (const cue of cues) {
    for (const raw of fold(cue.text).split(/[^\p{L}']+/u)) {
      const word = raw.replace(/'/g, '');
      if (!word) continue;
      total += 1;
      const theme = table.get(word);
      if (theme) scores[theme] += 1;
    }
  }
  const ranked = (Object.keys(scores) as LyricTheme[])
    .filter(theme => theme !== 'neutral')
    .sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0];
  const hits = scores[best];
  // Need at least 2 matching words and a lead over the runner-up, otherwise stay neutral.
  if (!total || hits < 2 || hits === scores[ranked[1]]) return { theme: 'neutral', confidence: 0, hits, read: true };
  return { theme: best, confidence: Math.min(1, hits / Math.max(4, total * 0.25)), hits, read: true };
}

/**
 * Lane = what the song is. Genre locks win; otherwise lyrics and audio vote.
 * `audioLane` is the lane the DSP/genre logic already produced.
 */
export function laneFromLyrics(audioLane: MoodLane, genreLocked: boolean, mood: LyricMood): MoodLane {
  if (genreLocked || mood.theme === 'neutral') return audioLane;
  switch (mood.theme) {
    case 'faith': return 'gospel';
    case 'sorrow': return audioLane === 'dark' ? 'dark' : 'quiet';
    case 'love': return audioLane === 'party' ? 'general' : 'quiet';
    case 'party': return audioLane === 'quiet' || audioLane === 'dark' ? 'general' : 'party';
    case 'rage': return 'dark';
    default: return audioLane;
  }
}

/** Frame where the first phrase is almost fully sung — the card poster shows real type, not an empty frame. */
export function posterFrame(cues: readonly LyricCue[]): number {
  const phrase = phrasesFor(cues)[0];
  if (!phrase) return 0;
  const end = phrase.words[phrase.words.length - 1].endMs;
  const ms = phrase.startMs + (end - phrase.startMs) * 0.85;
  return Math.max(0, Math.min(FRAMES - 1, Math.round(ms * FPS / 1000)));
}
