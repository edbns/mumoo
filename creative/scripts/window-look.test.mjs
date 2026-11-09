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

test('the screens are six flat, different colours: black, off-white, hot red, cobalt, acid yellow and deep green', async () => {
  const { server, look, colors } = await load();
  try {
    assert.deepEqual(look.WINDOW_SCREENS.map(screen => screen.name), ['black', 'off-white', 'hot red', 'cobalt', 'acid yellow', 'deep green']);
    for (const { hex } of look.WINDOW_SCREENS) assert.match(hex, /^#[0-9a-f]{6}$/);
    assert.equal(new Set(look.WINDOW_SCREENS.map(screen => screen.hex)).size, 6, 'no two the same');
    const [black, offWhite, red, cobalt, yellow, green] = look.WINDOW_SCREENS.map(screen => screen.hex);
    assert.ok(colors.luminance(black) < 0.01 && colors.luminance(offWhite) > 0.8, 'black is black and off-white is light');
    for (const bold of [red, cobalt, yellow, green]) assert.ok(colors.contrast(bold, black) >= 2 || colors.contrast(bold, offWhite) >= 2, `${bold} is bold against black or white`);
  } finally { await server.close(); }
});

test('the screen starts on one colour and flips to a different one on every downbeat, the same way every time', async () => {
  const { server, look } = await load();
  try {
    const downbeats = [1000, 3000, 5000, 7000, 9000];
    const at = ms => look.screenAt(4, look.WINDOW_SCREENS, ms, downbeats);
    assert.deepEqual(at(500), at(900), 'no flip between downbeats');
    assert.deepEqual(at(500), look.screenAt(4, look.WINDOW_SCREENS, 0, []), 'it starts on the colour its seed picks');
    for (let bar = 0; bar < downbeats.length; bar++) {
      const before = at(downbeats[bar] - 1);
      const after = at(downbeats[bar]);
      assert.notEqual(after.hex, before.hex, 'a downbeat flips the colour');
      assert.deepEqual(after, at(downbeats[bar] + 800), 'and it stays flipped');
    }
    assert.deepEqual(at(6100), look.screenAt(4, look.WINDOW_SCREENS, 6100, downbeats), 'a pure function of the clock');
    const starts = new Set(Array.from({ length: 40 }, (_, seed) => look.screenAt(seed, look.WINDOW_SCREENS, 0, []).hex));
    assert.ok(starts.size >= 4, 'other seeds start on other colours');
    const one = [look.WINDOW_SCREENS[2]];
    assert.deepEqual(look.screenAt(4, one, 8000, downbeats), one[0], 'one colour never flips');
    assert.throws(() => look.screenAt(4, [], 0, []), /needs a screen colour/);
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
    assert.throws(() => look.layoutWords('  ', measure), /needs a word/);
  } finally { await server.close(); }
});

test('with a person in front the words take the room above her head, and she is moved down to leave it', async () => {
  const { server, look } = await load();
  try {
    const { SAFE_BOX, REST_BOX } = look;
    const high = look.personStage(0);
    assert.ok(high.drop > 300, 'a head at the very top is moved down');
    assert.ok(high.box.height < REST_BOX.height, 'the words get less than the whole safe box');
    assert.ok(high.centre[1] - (high.box.height * (1 + look.PUNCH_SWELL)) / 2 >= SAFE_BOX.y - 1e-6, 'and sit inside the top of it');
    assert.ok(high.centre[1] + (high.box.height * (1 + look.PUNCH_SWELL)) / 2 <= SAFE_BOX.y + high.drop + 200 + 1e-6, 'with their lower edge tucked behind her head');
    const low = look.personStage(900);
    assert.equal(low.drop, 0, 'a head that is low already is left where it is');
    assert.ok(low.box.height > high.box.height, 'and gives the words more room');
    assert.ok(low.box.height <= REST_BOX.height + 1e-6, 'but never more than the safe box');
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
