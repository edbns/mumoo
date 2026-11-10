/**
 * Doodle: the parts a singer is drawn from. Every part is a few strokes of SVG path data in one 300-unit space
 * (the figure stands on y = 350, its head is centred on x = 150), kept as text so that it can be read, edited and
 * drawn with Path2D in the browser and in the cloud render alike. Nothing here is a picture and nothing is generated:
 * these are shapes written by hand, put together by the genre, the voice and the mood of the song.
 *
 * Style comes from what a singer wears and holds (a bandana, a beret, headphones, a guitar), never from skin or race.
 */

export const INK = '#111';
/** Where a figure's head and mouth are, in its own space (before the head is drawn bigger). */
export const HEAD_CENTRE: readonly [number, number] = [150, 130];
export const HEAD_SCALE = 1.25;
export const GROUND = 350;

export type DoodleMood = 'joyful' | 'flirty' | 'angry' | 'sad' | 'boastful';
export const DOODLE_MOODS: readonly DoodleMood[] = ['joyful', 'flirty', 'angry', 'sad', 'boastful'];

export type FaceSpot = { x1: number; x2: number; ey: number; mx: number; my: number; w: number; mouth?: boolean };

/** The face a mood draws on a head: eyes, brows and mouth sit where the head says they sit. */
export function moodFace(mood: DoodleMood, spot: FaceSpot, talk = 0): string {
  const { x1, x2, ey, mx, my, w, mouth = true } = spot;
  const eye = (x: number) => `<circle cx="${x}" cy="${ey}" r="3.6" fill="${INK}" stroke="none"/>`;
  const brow = (x: number, dir: number, thick = 4) => `<path d="M${x - 10} ${ey - 10 - dir * 4}L${x + 10} ${ey - 10 + dir * 4}" fill="none" stroke-width="${thick}"/>`;
  const grin = `<path d="M${mx - w} ${my}Q${mx} ${my + w * 1.3} ${mx + w} ${my}Z" fill="${INK}"/><path d="M${mx - w * 0.5} ${my + w * 0.55}Q${mx} ${my + w * 0.95} ${mx + w * 0.5} ${my + w * 0.55}" fill="#fff" stroke="none"/>`;
  // A word being sung opens the mouth: a dark oval that swallows whatever line the mood drew.
  const open = mouth && talk > 0 ? `<ellipse cx="${mx}" cy="${my + 3}" rx="${w * 0.55}" ry="${3 + 7 * talk}" fill="${INK}" stroke="${INK}" stroke-width="2"/>` : '';
  switch (mood) {
    case 'joyful':
      return eye(x1) + eye(x2) + brow(x1, 0.4, 3) + brow(x2, -0.4, 3) + (mouth ? grin : '') + open;
    case 'flirty':
      return eye(x1) + `<path d="M${x2 - 6} ${ey + 1}Q${x2} ${ey - 6} ${x2 + 6} ${ey + 1}" fill="none" stroke-width="4"/>` + brow(x1, 0.5, 3) +
        (mouth ? `<path d="M${mx - w} ${my + 2}Q${mx + 2} ${my + w * 0.8} ${mx + w} ${my - 4}" fill="none"/>` : '') + open;
    case 'angry':
      return eye(x1) + eye(x2) + brow(x1, 1.3, 6) + brow(x2, -1.3, 6) +
        (mouth ? `<path d="M${mx - w} ${my + 6}Q${mx} ${my - 8} ${mx + w} ${my + 6}Z" fill="${INK}"/>` : '') + open;
    case 'sad':
      return eye(x1) + eye(x2) + brow(x1, -1, 4) + brow(x2, 1, 4) +
        (mouth ? `<path d="M${mx - w * 0.8} ${my + 5}Q${mx} ${my - 6} ${mx + w * 0.8} ${my + 5}" fill="none"/>` : '') +
        `<path d="M${x1 - 2} ${ey + 8}c-5 9 5 11 0 20" fill="#fff" stroke-width="3"/>` + open;
    case 'boastful':
      return `<path d="M${x1 - 14} ${ey - 5}h${x2 - x1 + 28}" fill="none" stroke-width="3"/><path d="M${x1 - 14} ${ey - 5}h18v13h-18zM${x2 - 4} ${ey - 5}h18v13h-18z" fill="${INK}"/>` +
        (mouth ? `<path d="M${mx - w} ${my + 3}Q${mx + 2} ${my + w * 0.9} ${mx + w} ${my - 5}" fill="none"/>` : '') + open;
  }
}

export type HeadKind = 'man' | 'woman' | 'donkey' | 'cow' | 'rooster' | 'cat' | 'llama' | 'goat' | 'frog';
export const ANIMALS: readonly HeadKind[] = ['donkey', 'cow', 'rooster', 'cat', 'llama', 'goat', 'frog'];

/** How far a hat sits from where it was drawn, for a head that is taller or lower than a person's. */
export type Head = { draw: string; face: FaceSpot; hatDy: number };

export const HEADS: Record<HeadKind, Head> = {
  man: {
    draw: `<path d="M118 66C116 34 184 34 182 66C186 90 182 108 176 124C168 140 132 140 124 124C118 108 114 90 118 66Z" fill="#fff"/><circle cx="116" cy="84" r="7" fill="#fff"/><circle cx="184" cy="84" r="7" fill="#fff"/><path d="M151 74C142 92 140 102 150 104C155 104 158 101 159 98" fill="none" stroke-width="4"/>`,
    face: { x1: 137, x2: 163, ey: 72, mx: 150, my: 118, w: 12 },
    hatDy: 0,
  },
  woman: {
    draw: `<path d="M120 66C118 36 182 36 180 66C182 90 178 104 172 118C166 132 134 132 128 118C122 104 118 90 120 66Z" fill="#fff"/><circle cx="118" cy="84" r="6" fill="#fff"/><circle cx="182" cy="84" r="6" fill="#fff"/><path d="M151 80C146 90 145 96 151 98" fill="none" stroke-width="4"/><path d="M137 62C140 58 146 58 148 62M152 62C154 58 160 58 163 62" fill="none" stroke-width="2"/>`,
    face: { x1: 138, x2: 162, ey: 74, mx: 150, my: 112, w: 11 },
    hatDy: 0,
  },
  donkey: {
    draw: `<path d="M126 40L112 -6C124 -8 138 20 142 42ZM174 40L188 -6C176 -8 162 20 158 42Z" fill="#fff"/><path d="M118 8l8 24M182 8l-8 24" fill="none" stroke-width="3"/>
      <path d="M122 56C122 30 178 30 178 56C180 84 176 100 166 110L134 110C124 100 120 84 122 56Z" fill="#fff"/>
      <path d="M118 108C116 90 184 90 182 108C186 132 170 140 150 140C130 140 114 132 118 108Z" fill="#fff"/>
      <circle cx="140" cy="114" r="3.5" fill="${INK}" stroke="none"/><circle cx="160" cy="114" r="3.5" fill="${INK}" stroke="none"/>
      <path d="M134 38C142 24 158 24 166 38C158 32 142 32 134 38Z" fill="${INK}"/>`,
    face: { x1: 138, x2: 162, ey: 66, mx: 150, my: 128, w: 12 },
    hatDy: 6,
  },
  cow: {
    draw: `<path d="M126 52C112 48 106 36 112 24C118 36 124 40 130 42ZM174 52C188 48 194 36 188 24C182 36 176 40 170 42Z" fill="#fff"/>
      <path d="M110 76C96 74 94 88 108 92L120 84ZM190 76C204 74 206 88 192 92L180 84Z" fill="#fff"/>
      <path d="M122 50C122 32 178 32 178 50C182 84 176 96 170 106L130 106C124 96 118 84 122 50Z" fill="#fff"/>
      <path d="M126 52C130 44 142 46 144 56C142 70 128 70 126 52Z" fill="${INK}"/>
      <ellipse cx="150" cy="116" rx="30" ry="22" fill="#fff"/><circle cx="140" cy="116" r="4" fill="${INK}" stroke="none"/><circle cx="160" cy="116" r="4" fill="${INK}" stroke="none"/>`,
    face: { x1: 138, x2: 162, ey: 70, mx: 150, my: 130, w: 12 },
    hatDy: 4,
  },
  rooster: {
    draw: `<path d="M134 44C128 22 142 14 146 28C148 8 160 8 158 28C164 14 176 22 168 44Z" fill="${INK}"/>
      <path d="M120 70C118 40 182 40 180 70C184 98 170 118 150 118C130 118 116 98 120 70Z" fill="#fff"/>
      <path d="M138 84L150 112L162 84Z" fill="${INK}"/><path d="M144 112C140 128 160 128 156 112" fill="${INK}"/>`,
    face: { x1: 136, x2: 164, ey: 70, mx: 150, my: 112, w: 8, mouth: false },
    hatDy: 8,
  },
  cat: {
    draw: `<path d="M118 62L112 22L142 44ZM182 62L188 22L158 44Z" fill="#fff"/>
      <path d="M118 74C116 40 184 40 182 74C186 102 170 122 150 122C130 122 114 102 118 74Z" fill="#fff"/>
      <path d="M144 88h12l-6 8z" fill="${INK}"/><path d="M92 90l30 4M92 102l30-2M208 90l-30 4M208 102l-30-2" fill="none" stroke-width="2.5"/>`,
    face: { x1: 136, x2: 164, ey: 76, mx: 150, my: 106, w: 9 },
    hatDy: 6,
  },
  llama: {
    draw: `<path d="M130 46C118 22 122 2 134 -4C142 8 142 28 142 46Z" fill="#fff"/><path d="M170 46C182 22 178 2 166 -4C158 8 158 28 158 46Z" fill="#fff"/>
      <path d="M124 60C112 42 126 30 132 38C132 24 150 22 150 34C150 22 168 24 168 38C174 30 188 42 176 60Z" fill="#fff"/>
      <path d="M124 56C122 36 178 36 176 56C180 90 174 112 168 124C160 138 140 138 132 124C126 112 120 90 124 56Z" fill="#fff"/>
      <ellipse cx="150" cy="112" rx="17" ry="13" fill="#fff"/><path d="M150 102V120" fill="none" stroke-width="3"/><circle cx="143" cy="108" r="2.5" fill="${INK}" stroke="none"/><circle cx="157" cy="108" r="2.5" fill="${INK}" stroke="none"/>`,
    face: { x1: 138, x2: 162, ey: 72, mx: 150, my: 126, w: 8 },
    hatDy: 2,
  },
  goat: {
    draw: `<path d="M132 48C112 30 108 4 126 -8C122 14 130 30 144 42Z" fill="#fff"/><path d="M168 48C188 30 192 4 174 -8C178 14 170 30 156 42Z" fill="#fff"/>
      <path d="M118 66L90 58L96 78ZM182 66L210 58L204 78Z" fill="#fff"/>
      <path d="M122 52C122 34 178 34 178 52C182 80 176 110 164 124C156 134 144 134 136 124C124 110 118 80 122 52Z" fill="#fff"/>
      <path d="M142 130C146 152 154 152 158 130Z" fill="${INK}"/><circle cx="144" cy="108" r="2.5" fill="${INK}" stroke="none"/><circle cx="156" cy="108" r="2.5" fill="${INK}" stroke="none"/>`,
    face: { x1: 137, x2: 163, ey: 68, mx: 150, my: 120, w: 10 },
    hatDy: 8,
  },
  frog: {
    draw: `<path d="M104 80C104 52 196 52 196 80C200 110 180 124 150 124C120 124 100 110 104 80Z" fill="#fff"/>
      <circle cx="126" cy="52" r="18" fill="#fff"/><circle cx="174" cy="52" r="18" fill="#fff"/>
      <circle cx="144" cy="84" r="2.5" fill="${INK}" stroke="none"/><circle cx="156" cy="84" r="2.5" fill="${INK}" stroke="none"/>`,
    face: { x1: 126, x2: 174, ey: 54, mx: 150, my: 100, w: 24 },
    hatDy: 14,
  },
};

export type HairId = 'long' | 'bob' | 'afro' | 'pomp' | 'mohawk' | 'bun' | 'buns' | 'short' | 'bald';
export const HAIR_IDS: readonly HairId[] = ['long', 'bob', 'afro', 'pomp', 'mohawk', 'bun', 'buns', 'short', 'bald'];
/** back is drawn behind the head, front on top of it. */
export const HAIR: Record<HairId, { back: string; front: string }> = {
  long: { back: `<path d="M114 70C108 30 192 30 186 70C192 120 200 150 186 176C176 150 178 120 174 92L126 92C122 120 124 150 114 176C100 150 110 120 114 70Z" fill="${INK}"/>`, front: `<path d="M118 62C118 36 182 36 182 62C168 50 138 52 118 62Z" fill="${INK}"/>` },
  bob: { back: `<path d="M112 80C106 30 194 30 188 80C192 108 188 116 180 118L178 90L122 90L120 118C112 116 108 108 112 80Z" fill="${INK}"/>`, front: `<path d="M118 62C118 36 182 36 182 62C168 54 138 54 118 62Z" fill="${INK}"/>` },
  afro: { back: `<path d="M150 -6c-26-6-44 6-40 22c-22 0-32 22-18 36c-12 16-2 36 14 40L186 92c16-4 26-24 14-40c14-14 4-36-18-36c4-16-14-28-32-22Z" fill="${INK}"/>`, front: '' },
  pomp: { back: '', front: `<path d="M116 66C108 28 140 14 170 22C192 28 190 52 184 66C176 52 134 46 116 66Z" fill="${INK}"/>` },
  mohawk: { back: '', front: `<path d="M136 44L134 -6L146 30L152 -14L160 30L172 -4L166 44Z" fill="${INK}"/>` },
  bun: { back: `<circle cx="150" cy="14" r="17" fill="${INK}"/>`, front: `<path d="M118 62C118 34 182 34 182 62C168 50 138 52 118 62Z" fill="${INK}"/>` },
  buns: { back: `<circle cx="114" cy="30" r="17" fill="${INK}"/><circle cx="186" cy="30" r="17" fill="${INK}"/>`, front: `<path d="M118 62C118 34 182 34 182 62C168 50 138 52 118 62Z" fill="${INK}"/>` },
  short: { back: '', front: `<path d="M118 66C116 36 184 36 182 66C172 52 160 50 150 54C140 50 128 52 118 66Z" fill="${INK}"/>` },
  bald: { back: '', front: '' },
};

export type BeardId = 'full' | 'goatee' | 'stache';
export const BEARDS: Record<BeardId, string> = {
  full: `<path d="M120 100C124 138 176 138 180 100C172 116 164 112 150 112C136 112 128 116 120 100Z" fill="${INK}"/>`,
  goatee: `<path d="M138 120C140 146 160 146 162 120Z" fill="${INK}"/>`,
  stache: `<path d="M150 106C138 98 118 104 122 114C132 108 142 112 150 112C158 112 168 108 178 114C182 104 162 98 150 106Z" fill="${INK}"/>`,
};

export type HatId = 'bandana' | 'beret' | 'fedora' | 'cap' | 'backcap' | 'beanie' | 'cowboy' | 'headphones' | 'bow' | 'shadesUp' | 'hoops';
export const HAT_IDS: readonly HatId[] = ['bandana', 'beret', 'fedora', 'cap', 'backcap', 'beanie', 'cowboy', 'headphones', 'bow', 'shadesUp', 'hoops'];
export const HATS: Record<HatId, string> = {
  bandana: `<path d="M116 56C120 30 180 30 184 56C170 48 130 48 116 56Z" fill="${INK}"/><path d="M116 52C140 62 160 62 184 52L184 62C160 72 140 72 116 62Z" fill="#fff"/><path d="M118 54l-16 10 14 8ZM118 64l-14 16 16-4Z" fill="${INK}"/><circle cx="140" cy="60" r="2" fill="${INK}" stroke="none"/><circle cx="156" cy="62" r="2" fill="${INK}" stroke="none"/><circle cx="168" cy="58" r="2" fill="${INK}" stroke="none"/>`,
  beret: `<path d="M110 52C100 26 168 2 196 28C204 44 180 56 150 54C134 54 118 56 110 52Z" fill="${INK}"/><path d="M168 12l8-12" fill="none" stroke-width="5"/>`,
  fedora: `<path d="M92 56C112 64 188 64 208 56C196 54 190 50 188 44C186 10 114 10 112 44C110 50 104 54 92 56Z" fill="${INK}"/><path d="M114 44C132 52 168 52 186 44" fill="none" stroke="#fff" stroke-width="5"/>`,
  cap: `<path d="M118 62C116 30 184 30 182 62C164 54 136 54 118 62Z" fill="${INK}"/><path d="M182 58L222 66L182 70Z" fill="${INK}"/>`,
  backcap: `<path d="M118 62C116 30 184 30 182 62C164 54 136 54 118 62Z" fill="${INK}"/><path d="M118 58L82 64L118 70Z" fill="${INK}"/>`,
  beanie: `<path d="M118 62C114 14 186 14 182 62Z" fill="${INK}"/><path d="M114 60h72" stroke-width="10" fill="none"/><circle cx="150" cy="14" r="9" fill="${INK}"/>`,
  cowboy: `<path d="M84 40C112 54 188 54 216 40C200 36 192 38 188 30C184 -6 116 -6 112 30C108 38 100 36 84 40Z" fill="${INK}"/><path d="M114 30C134 40 166 40 186 30" fill="none" stroke="#fff" stroke-width="3"/>`,
  headphones: `<path d="M112 82C104 8 196 8 188 82" fill="none" stroke-width="8"/><rect x="100" y="70" width="22" height="40" rx="9" fill="${INK}"/><rect x="178" y="70" width="22" height="40" rx="9" fill="${INK}"/>`,
  bow: `<path d="M150 38L122 20L126 54ZM150 38L178 20L174 54Z" fill="#fff"/><circle cx="150" cy="38" r="7" fill="${INK}"/>`,
  shadesUp: `<path d="M124 46h24v10h-24zM152 46h24v10h-24z" fill="${INK}" transform="rotate(-4 150 50)"/>`,
  hoops: `<circle cx="108" cy="104" r="11" fill="none" stroke-width="4"/><circle cx="192" cy="104" r="11" fill="none" stroke-width="4"/>`,
};

export type BodyId = 'man' | 'woman';
export const BODIES: Record<BodyId, string> = {
  man: `<path d="M114 252L188 252L186 338L158 338L150 282L142 338L114 338Z" fill="#fff"/><path d="M150 282V252" fill="none" stroke-width="3"/>
    <ellipse cx="128" cy="344" rx="22" ry="8" fill="${INK}"/><ellipse cx="172" cy="344" rx="22" ry="8" fill="${INK}"/>
    <path d="M132 134L168 134L184 150L192 256L108 256L116 150Z" fill="#fff"/>
    <path d="M132 134L150 176L168 134" fill="none" stroke-width="4"/><path d="M150 176V256" fill="none" stroke-width="3"/><path d="M108 252h84" fill="none" stroke-width="7"/>`,
  woman: `<path d="M120 264L180 264L176 338L156 338L150 296L144 338L124 338Z" fill="#fff"/>
    <path d="M118 338l-6 8h28l2-8ZM162 338l-2 8h28l-6-8Z" fill="${INK}"/>
    <path d="M134 134L166 134L178 152L168 198L194 272L106 272L132 198L122 152Z" fill="#fff"/>
    <path d="M140 134C146 148 154 148 160 134" fill="none" stroke-width="3"/><path d="M132 198C146 206 154 206 168 198" fill="none" stroke-width="3"/>`,
};
export const NECK = '<path d="M140 126V140M160 126V140" fill="none" stroke-width="4"/>';

/** The arm that waves, drawn about the shoulder so it can swing on the beat; and the one that holds the microphone. */
export const ARM_BACK = (body: BodyId) => {
  const [sx, sy] = body === 'woman' ? [124, 152] : [118, 152];
  return `<path d="M${sx} ${sy}C94 ${sy + 10} 76 ${sy - 20} 70 ${sy - 52}" fill="none" stroke-width="6"/><path d="M62 96l-4-14M68 94l0-16M74 94l6-14M80 100l10-10" fill="none" stroke-width="3"/><circle cx="72" cy="104" r="9" fill="#fff"/>`;
};
export const SHOULDER_OF = (body: BodyId): readonly [number, number] => (body === 'woman' ? [124, 152] : [118, 152]);
export const ARM_FRONT = (body: BodyId) => {
  const [sx, sy] = body === 'woman' ? [172, 152] : [182, 152];
  return `<path d="M${sx} ${sy}C216 ${sy + 6} 222 ${sy + 2} 210 158" fill="none" stroke-width="6"/><circle cx="210" cy="156" r="8" fill="#fff"/>` +
    '<path d="M210 156L200 136" fill="none" stroke-width="6"/><circle cx="196" cy="126" r="11" fill="#fff"/><path d="M188 122l16 8M190 131l12-10" fill="none" stroke-width="2"/>';
};

export type PropId = 'chain' | 'guitar' | 'star' | 'rays' | 'hearts' | 'steam' | 'bowtie' | 'note';
export const PROP_IDS: readonly PropId[] = ['chain', 'guitar', 'star', 'rays', 'hearts', 'steam', 'bowtie', 'note'];
/** Props that hang on the body (drawn over it) and props that float around the singer. */
export const WORN: readonly PropId[] = ['chain', 'bowtie', 'guitar'];
export const PROPS: Record<PropId, string> = {
  chain: '<path d="M128 150C136 188 164 188 172 150" fill="none" stroke-width="4"/><circle cx="150" cy="190" r="10" fill="#fff" stroke-width="4"/>',
  guitar: `<path d="M206 262L270 190" stroke-width="8" fill="none"/><path d="M176 276C154 264 160 244 180 242C174 226 196 222 206 236C218 236 228 256 214 270C208 286 190 286 176 276Z" fill="#fff"/><circle cx="192" cy="256" r="5" fill="${INK}"/>`,
  star: '<path d="M44 80l8 18 20 2-15 13 5 20-18-10-18 10 5-20-15-13 20-2z" fill="#fff"/>',
  rays: '<path d="M40 160l22 8M30 200l26-2M44 242l22-12M260 160l-22 8M270 200l-26-2M256 242l-22-12" fill="none" stroke-width="5"/>',
  hearts: '<path d="M240 70c-10-14-26 2-12 14l12 10 12-10c14-12-2-28-12-14z" fill="#111"/><path d="M46 150c-8-10-20 2-10 11l10 8 10-8c10-9-2-21-10-11z" fill="#fff"/>',
  steam: '<path d="M100 40c-8-14 6-18 0-30M200 40c8-14-6-18 0-30" fill="none" stroke-width="4"/>',
  bowtie: `<path d="M150 150L132 140L132 160ZM150 150L168 140L168 160Z" fill="${INK}"/>`,
  note: '<path d="M236 160V130l22-6v30" fill="none" stroke-width="4"/><circle cx="230" cy="162" r="7" fill="#111"/><circle cx="252" cy="156" r="7" fill="#111"/>',
};
