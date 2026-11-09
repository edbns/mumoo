import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, look: await server.ssrLoadModule('/src/window-look.ts'), colors: await server.ssrLoadModule('/src/dust-colors.ts') };
}

/** A face of type where every letter is 60 px wide and 70 px tall at 100 px, a space is 30 px wide. */
const measure = text => ({ width: [...text].reduce((sum, letter) => sum + (letter === ' ' ? 30 : 60), 0), height: 70 });

const cue = (text, startMs, endMs) => ({ text, startMs, endMs });

/** The hue of a #rrggbb colour, in degrees. */
function hue(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test('there are sixteen flat, bold palettes that cover the whole hue wheel, with black, off-white and sand', async () => {
  const { server, look, colors } = await load();
  try {
    const { WINDOW_PALETTES: palettes, WINDOW_PALETTE_IDS: ids } = look;
    assert.equal(palettes.length, 16);
    assert.deepEqual(ids, palettes.map(palette => palette.id), 'the ids the wiring can check against');
    assert.equal(new Set(ids).size, 16, 'no two ids the same');
    assert.equal(new Set(palettes.map(palette => palette.screen)).size, 16, 'no two screens the same');
    for (const id of ['black', 'off-white', 'sand', 'hot-red', 'orange', 'sun-yellow', 'acid-yellow', 'lime', 'green', 'deep-green', 'teal', 'cyan', 'cobalt', 'violet', 'magenta', 'hot-pink']) assert.ok(ids.includes(id), id);
    for (const { id, screen, rim } of palettes) {
      assert.match(id, /^[a-z]+(-[a-z]+)*$/);
      assert.match(screen, /^#[0-9a-f]{6}$/);
      assert.match(rim, /^#[0-9a-f]{6}$/);
      assert.ok(colors.contrast(screen, rim) >= 1.5, `${id}: the rim shows against the screen`);
    }
    const [black, offWhite] = ['black', 'off-white'].map(id => look.paletteOf(id).screen);
    assert.ok(colors.luminance(black) < 0.01 && colors.luminance(offWhite) > 0.8, 'black is black and off-white is light');
    for (const id of ids.filter(id => !['black', 'off-white', 'sand'].includes(id))) {
      const { screen } = look.paletteOf(id);
      assert.ok(colors.contrast(screen, black) >= 2 || colors.contrast(screen, offWhite) >= 2, `${id} is bold against black or white`);
    }
    const hues = ids.filter(id => !['black', 'off-white', 'sand'].includes(id)).map(id => hue(look.paletteOf(id).screen)).sort((x, y) => x - y);
    const gaps = hues.map((at, i) => (i + 1 < hues.length ? hues[i + 1] : hues[0] + 360) - at);
    assert.ok(Math.max(...gaps) <= 65, `no gap on the hue wheel wider than 65 degrees (widest ${Math.max(...gaps).toFixed(0)})`);
    assert.throws(() => look.paletteOf('beige'), /no window palette/);
  } finally { await server.close(); }
});

test('every palette has three other palettes to flip to, each a strong contrast, and every palette is flipped to by another', async () => {
  const { server, look, colors } = await load();
  try {
    const flippedTo = new Set();
    for (const palette of look.WINDOW_PALETTES) {
      assert.equal(palette.flips.length, 3);
      assert.equal(new Set(palette.flips).size, 3, `${palette.id}: three different flips`);
      for (const flip of palette.flips) {
        assert.notEqual(flip, palette.id);
        assert.ok(look.WINDOW_PALETTE_IDS.includes(flip), `${palette.id} flips to a real palette`);
        assert.ok(colors.contrast(palette.screen, look.paletteOf(flip).screen) >= 2, `${palette.id} to ${flip} is a strong contrast`);
        flippedTo.add(flip);
      }
    }
    assert.deepEqual([...flippedTo].sort(), [...look.WINDOW_PALETTE_IDS].sort(), 'a card can land on any colour, not only start on it');
  } finally { await server.close(); }
});

test('the screen starts on its palette and flips to one of its flip colours on every downbeat, the same way every time', async () => {
  const { server, look } = await load();
  try {
    const downbeats = [1000, 3000, 5000, 7000, 9000];
    const at = (ms, start = 'cobalt') => look.screenAt(4, start, ms, downbeats);
    assert.equal(look.screenAt(4, 'cobalt', 0, []).id, 'cobalt', 'it starts on the palette it is dealt');
    assert.deepEqual(at(500), at(900), 'no flip between downbeats');
    assert.equal(at(500).id, 'cobalt');
    for (let bar = 0; bar < downbeats.length; bar++) {
      const before = at(downbeats[bar] - 1);
      const after = at(downbeats[bar]);
      assert.ok(before.flips.includes(after.id), 'a downbeat flips to one of the flip colours');
      assert.deepEqual(after, at(downbeats[bar] + 800), 'and it stays flipped');
    }
    assert.deepEqual(at(6100), look.screenAt(4, 'cobalt', 6100, downbeats), 'a pure function of the clock');
    const next = new Set(Array.from({ length: 40 }, (_, seed) => look.screenAt(seed, 'black', 1500, [1000]).id));
    assert.deepEqual([...next].sort(), [...look.paletteOf('black').flips].sort(), 'other seeds flip to the other flip colours');
    const only = ['black', 'off-white', 'hot-red'];
    for (let seed = 0; seed < 20; seed++) {
      for (let ms = 0; ms < 10000; ms += 500) assert.ok(only.includes(look.screenAt(seed, 'black', ms, downbeats, only).id), 'never flips onto a palette that is not allowed');
    }
    assert.throws(() => look.screenAt(4, 'teal', 0, [], only), /not allowed/);
    assert.equal(look.screenAt(4, 'black', 5000, downbeats, ['black', 'cobalt']).id, 'black', 'a palette none of whose flips is allowed holds its colour');
    assert.throws(() => look.screenAt(4, 'beige', 0, []), /not allowed|no window palette/);
  } finally { await server.close(); }
});

test('a screen that is too close to the picture in the letters is not dealt: no yellow round a pale yellow picture', async () => {
  const { server, look, colors } = await load();
  try {
    const palePicture = Array.from({ length: 50 }, (_, i) => (i % 2 ? '#f5f0a8' : '#ede89a'));
    const forPale = look.legiblePalettes(palePicture);
    for (const id of ['sun-yellow', 'acid-yellow', 'off-white', 'sand']) assert.ok(!forPale.includes(id), `${id} does not read on a pale yellow picture`);
    for (const id of ['black', 'cobalt', 'deep-green']) assert.ok(forPale.includes(id), `${id} reads on a pale yellow picture`);
    const darkPicture = Array.from({ length: 50 }, () => '#101214');
    const forDark = look.legiblePalettes(darkPicture);
    assert.ok(!forDark.includes('black'), 'a dark picture does not read on black');
    assert.ok(forDark.includes('off-white') && forDark.includes('acid-yellow'));
    // However light or dark the picture, enough colours are left, and every one of them reads.
    for (const grey of ['#000000', '#101010', '#202020', '#404040', '#606060', '#808080', '#a0a0a0', '#c0c0c0', '#e0e0e0', '#ffffff']) {
      const ids = look.legiblePalettes([grey]);
      assert.ok(ids.length >= 4, `${grey}: ${ids.length} palettes left`);
      for (const id of ids) {
        assert.ok(colors.contrast(look.paletteOf(id).screen, grey) >= look.MIN_PICTURE_CONTRAST, `${grey}: ${id} reads`);
      }
    }
    assert.deepEqual(look.legiblePalettes(palePicture), forPale, 'a pure function');
    assert.throws(() => look.legiblePalettes([]), /needs colours/);
  } finally { await server.close(); }
});

test('the window is set in heavy condensed faces only, so that its letters come out tall', async () => {
  const { server, look } = await load();
  try {
    assert.ok(look.WINDOW_FACES.length >= 4);
    assert.equal(new Set(look.WINDOW_FACES).size, look.WINDOW_FACES.length);
    assert.ok(look.WINDOW_FACES.includes('Anton'));
  } finally { await server.close(); }
});

test('words go into the window one or two at a time, never a long run, and never across a pause', async () => {
  const { server, look } = await load();
  try {
    const cues = [cue('No', 0, 100), cue('me', 150, 250), cue('quieras,', 300, 500), cue('cambiar.', 550, 900), cue('Varias', 2000, 2200), cue('lo', 2250, 2350), cue('intentaron', 2400, 2900)];
    const groups = look.wordGroups(cues);
    assert.deepEqual(groups.map(group => group.text), ['No me', 'quieras', 'cambiar', 'Varias lo', 'intentaron'], 'two short words at a time, no commas or full stops, a long word alone');
    assert.deepEqual(groups.map(group => group.startMs), [0, 300, 550, 2000, 2400]);
    assert.deepEqual(groups[0], { text: 'No me', startMs: 0, endMs: 250 }, 'a group lasts from its first word to the end of its last');
    for (const { text } of groups) {
      assert.ok(text.split(' ').length <= look.GROUP_WORDS);
      assert.ok(text.replace(' ', '').length <= look.GROUP_LETTERS || !text.includes(' '));
    }
    const across = look.wordGroups([cue('a', 0, 100), cue('b', 100 + look.PHRASE_GAP_MS + 1, 700)]);
    assert.equal(across.length, 2, 'a pause longer than a phrase gap parts them');
    assert.equal(look.wordGroups([cue('go', 0, 100), cue('now', 100 + look.PHRASE_GAP_MS, 700)]).length, 1, 'a pause no longer than that does not');
    assert.deepEqual(look.wordGroups([cue('...', 0, 100)]), [], 'a cue with nothing but punctuation has no word');
    assert.equal(look.wordGroups([cue('never gonna let you go', 0, 3000)])[0].text, 'never gonna let you go', 'a cue that is already a phrase stays whole');
  } finally { await server.close(); }
});

test('the window shows the newest words, holds them a moment, and closes between phrases', async () => {
  const { server, look } = await load();
  try {
    const groups = look.wordGroups([cue('one', 1000, 1300), cue('two', 3000, 3300), cue('thirteen', 3600, 3900), cue('four', 5000, 5400)]);
    assert.equal(look.groupAt(groups, 500), -1, 'closed before the first words');
    assert.equal(look.groupAt(groups, 1000), 0);
    assert.equal(look.groupAt(groups, 1300 + look.HOLD_MS - 1), 0, 'the last words of a phrase are held a moment');
    assert.equal(look.groupAt(groups, 1300 + look.HOLD_MS), -1, 'then the window closes');
    assert.equal(look.groupAt(groups, 2999), -1);
    assert.equal(look.groupAt(groups, 3000), 1);
    assert.equal(look.groupAt(groups, 3599), 1, 'next words come soon after, within a phrase gap: the window stays open until they do');
    assert.equal(look.groupAt(groups, 3600), 2);
    assert.equal(look.groupAt(groups, 99999), -1, 'closed after the last words');
  } finally { await server.close(); }
});

test('words are set as big as the safe area allows, a line as wide as it, and punched at full size they stay inside it', async () => {
  const { server, look } = await load();
  try {
    const { SAFE_BOX, REST_BOX } = look;
    assert.equal(SAFE_BOX.x, 54, 'the same sides as Spray');
    assert.ok(SAFE_BOX.y + SAFE_BOX.height <= 1574, 'above the platform buttons');
    const one = look.layoutWords('GO', measure);
    assert.equal(one.lines.length, 1);
    assert.ok(Math.abs(one.width - REST_BOX.width) < 1e-6 || Math.abs(one.height - REST_BOX.height) < 1e-6, 'it fills the box one way or the other');
    for (const text of ['I', 'NO', 'LOVE ME', 'NEVER GONNA LET YOU GO TONIGHT', 'INTENTARON', 'A B C D E F G H I J']) {
      const layout = look.layoutWords(text, measure);
      assert.ok(layout.lines.length >= 1 && layout.lines.length <= 3, `${text}: one to three lines`);
      assert.ok(layout.width <= REST_BOX.width + 1e-6 && layout.height <= REST_BOX.height + 1e-6, `${text}: inside the box`);
      assert.ok(layout.width * (1 + look.PUNCH_SWELL) <= SAFE_BOX.width + 1e-6 && layout.height * (1 + look.PUNCH_SWELL) <= SAFE_BOX.height + 1e-6, `${text}: still inside the safe area at the top of a punch`);
      assert.equal(layout.lines.map(line => line.text).join(' '), text, `${text}: no word is split and none lost`);
      for (const line of layout.lines) {
        assert.ok(line.x >= -1e-6 && line.x + line.width <= layout.width + 1e-6, `${text}: lines are centred in the block`);
        assert.ok(line.y >= 0 && line.y + line.height <= layout.height + 1e-6);
      }
      assert.deepEqual(look.layoutWords(text, measure), layout, 'a pure function');
    }
    const long = look.layoutWords('NEVER GONNA LET YOU GO TONIGHT', measure);
    assert.ok(long.lines.length >= 2, 'a long line wraps');
    assert.ok(look.layoutWords('GO NOW', measure).lines[0].size > look.layoutWords('GO NOW', measure, { width: REST_BOX.width, height: 100 }).lines[0].size, 'a shorter box means smaller type');
    assert.ok(look.layoutWords('NO', measure).lines[0].size > look.layoutWords('NEVER', measure).lines[0].size, 'a short word is set bigger than a long one');
    const tower = look.layoutWords('I NEVER', measure, { width: 300, height: 1000 });
    assert.equal(tower.lines.length, 2, 'a lone I over a word is worth a line');
    assert.ok(tower.lines[0].size <= tower.lines[1].size * 2.2 + 1e-6, 'but it is not blown up to a tower');
    assert.throws(() => look.layoutWords('  ', measure), /needs a word/);
  } finally { await server.close(); }
});

test('with a person in front she is moved down to leave room, and the words sit on her head with their lower edge tucked behind it', async () => {
  const { server, look } = await load();
  try {
    const { SAFE_BOX } = look;
    const high = look.personStage(0);
    assert.ok(high.drop > 300, 'a head at the very top is moved down');
    assert.equal(high.headAt, high.drop, 'and the head is where she was brought');
    assert.ok(high.headAt <= 1920 * 0.4, 'but not so far that most of her body is lost');
    const low = look.personStage(900);
    assert.equal(low.drop, 0, 'a head that is low already is left where it is');
    assert.equal(low.headAt, 900);
    for (const text of ['CAMBIAR', 'NO', 'MY BAD', 'TO CHANGE', 'NEVER GONNA LET YOU GO TONIGHT']) {
      for (const headAt of [high.headAt, low.headAt]) {
        const { layout, centre } = look.personWords(text, measure, headAt);
        const half = (layout.height * (1 + look.PUNCH_SWELL)) / 2;
        assert.ok(layout.width * (1 + look.PUNCH_SWELL) <= SAFE_BOX.width + 1e-6, `${text}: inside the sides`);
        assert.ok(centre[1] - half >= SAFE_BOX.y - 1e-6, `${text}: below the top bar`);
        assert.ok(centre[1] + half <= SAFE_BOX.y + SAFE_BOX.height + 1e-6, `${text}: above the platform buttons`);
        assert.ok(centre[1] + half > headAt || headAt >= SAFE_BOX.y + SAFE_BOX.height - 1, `${text}: its lower edge reaches behind her head`);
        assert.ok(centre[1] + half - headAt <= layout.lines.at(-1).height * (1 + look.PUNCH_SWELL) * 0.5, `${text}: but only a little way`);
        assert.deepEqual(look.personWords(text, measure, headAt), { layout, centre }, 'a pure function');
      }
    }
    assert.ok(look.personWords('MY BAD', measure, low.headAt).layout.lines[0].size >= look.personWords('MY BAD', measure, high.headAt).layout.lines[0].size, 'more room above her means bigger words');
  } finally { await server.close(); }
});

test('a beat punches the window, a downbeat harder, and the punch dies away', async () => {
  const { server, look } = await load();
  try {
    const beats = [0, 500, 1000, 1500];
    const downbeats = [0, 1500];
    const punch = ms => look.punchAt(ms, beats, downbeats);
    assert.equal(look.punchAt(-1, beats, downbeats), 0, 'nothing before the first beat');
    assert.ok(punch(1510) > punch(1010), 'a downbeat punches harder than a plain beat');
    assert.ok(punch(1010) > 0.3, 'a plain beat is felt');
    assert.ok(punch(1510) > punch(1700) && punch(1700) > punch(1900), 'it dies away');
    assert.ok(punch(1999) < 0.01);
    assert.ok(punch(1500) <= 1 && punch(1500) > 0.99, 'a downbeat lands at full strength');
  } finally { await server.close(); }
});

test('the window swells on a punch, new words spring to size, and the picture behind pushes in', async () => {
  const { server, look } = await load();
  try {
    assert.equal(look.windowScale(0, Infinity), 1, 'at rest it is its fitted size');
    assert.ok(Math.abs(look.windowScale(1, Infinity) - (1 + look.PUNCH_SWELL)) < 1e-9, 'a full punch swells it by the room that was left');
    assert.ok(look.windowScale(0, 0) < 0.9, 'new words start small');
    let before = 0;
    for (let ms = 0; ms <= 400; ms += 20) {
      const scale = look.windowScale(0, ms);
      assert.ok(scale >= before && scale <= 1, 'and only grow back to size');
      before = scale;
    }
    assert.ok(look.windowScale(0, 300) > 0.99, 'in a moment');
    assert.ok(look.pictureScale(1000, 1, false) > look.pictureScale(1000, 0, false), 'a punch pushes the picture in');
    assert.ok(look.pictureScale(9000, 0, false) > look.pictureScale(1000, 0, false), 'and it creeps in all the while');
    assert.equal(look.pictureScale(0, 0, false), 1);
    assert.ok(look.pictureScale(0, 0, true) > 1, 'behind a person it is shown bigger, so her face is not in the letters too');
    const [width, height] = look.coverSize(1280, 720);
    assert.ok(width >= 1080 && height >= 1920 && Math.abs(width / height - 1280 / 720) < 1e-9, 'a landscape picture covers the portrait frame without being squeezed');
  } finally { await server.close(); }
});
