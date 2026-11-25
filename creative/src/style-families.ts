import type { Style } from './style-search';

/**
 * The families the song step groups styles in, so a word that names several kinds of music ("funk": American funk, and
 * Brazilian baile funk) shows each kind on its own. A style is in the family that names it here, else in the one its
 * genre and sub-genre fall in.
 */
const NAMED: Record<string, readonly string[]> = {
  'Phonk & Dark Trap': ['phonk', 'Brazilian phonk', 'drift phonk', 'phonk house', 'rare phonk', 'doomshop phonk', 'Memphis rap', 'horrorcore'],
  // The most popular first: they lead the family in the list.
  'Brazilian Funk / Baile': ['funk carioca', 'Brazilian funk', 'funk ostentação', 'brega funk', 'funk mandelão', 'funk melody', 'funk proibidão',
    'rasteirinha', 'funk automotivo', 'montagem', 'funk 150 bpm', 'beat bruxaria', 'arrocha funk', 'beat fino', 'eletrofunk', 'funk consciente',
    'funk de BH', 'funk ousadia', 'funk paulista', 'funknejo', 'mega funk', 'new funk', 'rave funk', 'ritmada', 'trapfunk'],
  'Funk & Groove (American / Global)': ['funk', 'P-Funk', 'jazz-funk', 'funk rock', 'synth funk', 'boogie', 'G-funk', 'go-go', 'deep funk', 'Brit funk',
    'electro funk', 'Afro-funk', 'avant-funk', 'bayou funk', 'deep funk revival', 'disco-funk', 'funk soul', 'funkcore', 'Israeli funk', 'Latin funk',
    'nu-funk', 'porn groove', 'psychedelic funk', 'punk funk', 'samba-funk', 'soul jazz'],
  'Afrobeats, Amapiano & Afro-Fusion': ['Afrobeats', 'Amapiano', 'Afrobeat', 'Afropiano', 'Afrosounds', 'African popular music', 'alté', 'Afro house',
    'Afro tech', '3-step', 'gqom', 'gqom tech', 'gqom trap', 'Afrikaans gqom', 'electro gqom', 'gospel gqom', 'highlife', 'burger-highlife', 'Igbo highlife',
    'kizomba', 'kuduro', 'coupé-décalé', 'bongo flava', 'gengetone', 'kwaito', 'marabi', 'mbaqanga', 'shangaan electro', 'singeli', 'Afroswing', 'Yo-pop',
    'kidandali', 'adaha', 'bolojo', 'Owerri bongo', 'Ikwokirikwo', 'gommance'],
  'Brazilian Regional (Sertanejo, Forró, Samba & MPB)': ['sertanejo', 'sertanejo de raiz', 'sertanejo romântico', 'sertanejo universitário', 'agronejo',
    'Feminejo', 'forró', 'forró de favela', 'forró double meaning', 'forró universitário', 'electronic forró', 'pisadinha', 'piseiro', 'samba', 'samba afro',
    'samba de breque', 'samba de gafieira', 'samba de roda', 'samba de terreiro', 'samba duro', 'samba junino', 'samba rap', 'samba reggae', 'samba rock',
    'samba soul', 'samba-batido', 'samba-canção', 'samba-choro', 'samba-chulado', 'samba-corrido', 'samba-enredo', 'samba-exaltação', 'samba-jazz',
    'samba-joia', 'samba-maxixe', 'samba-raiado', 'samba-sincopado', 'sambalanço', 'roda de samba', 'pagode', 'pagode baiano', 'pagode de viola',
    'pagode romântico', 'swingueira', 'percussive pagodas', 'bossa nova', 'música popular brasileira', 'axé', 'lambada', 'lambadão cuiabano', 'brega',
    'brega pop', 'bregadeira', 'eletrobrega', 'tecno brega', 'tecnofunk', 'rock doido', 'frevo', 'frevo de bloco', 'frevo de rua', 'frevo elétrico',
    'frevo-canção', 'choro', 'baião', 'xote', 'maracatu', 'maracatu nação', 'maracatu rural', 'tropicália', 'tropicanibalismo', 'carimbó', 'guitarrada',
    'vanguarda paulista', 'nova vanguarda paulistana', 'clube da esquina', 'jovem guarda', 'mangue bit', 'udigrudi', 'music of Brazil',
    'Afro-Brazilian music', 'northeastern Brazilian music', 'northern Brazilian music', 'Southeastern Brazilian music', 'southern Brazilian music',
    'Brazilian gaucho music'],
  'Modern & Regional Hip-Hop': ['Brazilian hip-hop'],
  'Trap, Drill & Rage': ['Bronx drill'],
  'Mainstream & Dance-Pop': ['Latin pop'],
  'Regional Latin, Tango & Flamenco': ['corrido', 'narcocorrido'],
  'Country & Americana': ['Americana'],
  'Punk, Hardcore & Emo': ['Midwest emo', 'emo pop'],
};

const BY_SUB_GENRE: Record<string, string> = {
  'Jazz, Soul & Blues|Smooth Jazz / Soul': 'Soul & Contemporary R&B',
  'Jazz, Soul & Blues|General Jazz & Blues': 'Jazz & Blues',
  'Jazz, Soul & Blues|Electro-Swing': 'Jazz & Blues',
  'Latin & Urbano|Reggaeton': 'Reggaeton, Dembow & Latin Trap',
  'Latin & Urbano|Latin Trap': 'Reggaeton, Dembow & Latin Trap',
  'Latin & Urbano|Traditional Latin (Salsa, Bachata)': 'Salsa, Cumbia, Bachata & Merengue',
  'Latin & Urbano|General Latin': 'Regional Latin, Tango & Flamenco',
  'Electronic & Dance (EDM)|House': 'House & Disco',
  'Electronic & Dance (EDM)|Deep House': 'House & Disco',
  'Electronic & Dance (EDM)|Tech House': 'House & Disco',
  'Electronic & Dance (EDM)|Slap House': 'House & Disco',
  'Electronic & Dance (EDM)|G-House': 'House & Disco',
  'Electronic & Dance (EDM)|Afro House': 'Afrobeats, Amapiano & Afro-Fusion',
  'Electronic & Dance (EDM)|Techno': 'Techno & Minimal',
  'Electronic & Dance (EDM)|Dubstep / Riddim': 'Dubstep, Riddim & Bass',
  'Electronic & Dance (EDM)|Ambient / Downtempo': 'Ambient, Chillout & Downtempo',
  'Electronic & Dance (EDM)|Synthwave / Vaporwave': 'Synthwave, Vaporwave & Retro Electronic',
  'Electronic & Dance (EDM)|General Electronic': 'Electronic, DnB, Trance & Club',
  'Hip-Hop & Rap|Trap': 'Trap, Drill & Rage',
  'Hip-Hop & Rap|Boom Bap / Lo-Fi': 'Boom Bap, Lo-Fi & Classic Hip-Hop',
  'Hip-Hop & Rap|Psychedelic Rap': 'Modern & Regional Hip-Hop',
  'Hip-Hop & Rap|General Hip-Hop': 'Modern & Regional Hip-Hop',
  'Reggae & Dancehall|Dancehall / Afrobeats': 'Reggae, Dancehall & Ska',
  'Reggae & Dancehall|Roots Reggae': 'Reggae, Dancehall & Ska',
  'Reggae & Dancehall|General Reggae': 'Reggae, Dancehall & Ska',
  'Pop|Indie Pop': 'Indie, Alt & Bedroom Pop',
  'Pop|K-Pop / J-Pop': 'K-Pop, J-Pop & Asian Pop',
  'Pop|Dance-Pop': 'Mainstream & Dance-Pop',
  'Pop|General Pop': 'Mainstream & Dance-Pop',
  'Rock|Alternative / Indie Rock': 'Indie, Alt Rock & Shoegaze',
  'Rock|Psychedelic Rock': 'Classic, Hard & Psychedelic Rock',
  'Rock|General Rock': 'Classic, Hard & Psychedelic Rock',
  'Country & Folk|Modern Country': 'Country & Americana',
  'Country & Folk|Americana / Folk': 'Traditional & World Folk',
};

const BY_GENRE: Record<string, string> = {
  Punk: 'Punk, Hardcore & Emo',
  Metal: 'Heavy & Extreme Metal',
  'Classical & Cinematic': 'Classical, Opera & Cinematic',
  'Gospel & Christian': 'Gospel, Worship & Christian',
  'Experimental & Avant-Garde': 'Experimental, Industrial & Noise',
};

const named = new Map(Object.entries(NAMED).flatMap(([family, names]) => names.map((name, place) => [name.toLowerCase(), { family, place }] as const)));

export const BRAZILIAN_FUNK = 'Brazilian Funk / Baile';

export function familyOf(style: Pick<Style, 'name' | 'genre' | 'subGenre'>): string {
  const own = named.get(style.name.toLowerCase());
  if (own) return own.family;
  // Every tango of the Latin directory is Regional Latin's, whatever sub-genre it came under.
  if (style.genre === 'Latin & Urbano' && /tango/i.test(style.name)) return 'Regional Latin, Tango & Flamenco';
  return BY_SUB_GENRE[`${style.genre}|${style.subGenre}`] ?? BY_GENRE[style.genre] ?? 'Other';
}

/** The families listed most popular first, and how many of each lead it. */
const LEADS: Record<string, number> = { 'Phonk & Dark Trap': 4, 'Brazilian Funk / Baile': 12, 'Funk & Groove (American / Global)': 11, 'Afrobeats, Amapiano & Afro-Fusion': 3 };

/** Where a style stands among its family's most popular (lower first); the rest come after, as found. */
export function popularity(name: string): number {
  const own = named.get(name.toLowerCase());
  return own && own.place < (LEADS[own.family] ?? 0) ? own.place : Infinity;
}

/** The styles the Silhouette skull is dealt for: any phonk, and Brazilian funk. Plain funk is not: that is the jazzy kind. */
export const isSkullStyle = (name: string) => /phonk/i.test(name) || named.get(name.toLowerCase())?.family === BRAZILIAN_FUNK;
