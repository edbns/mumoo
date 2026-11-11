import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const WORKER_FILE = fileURLToPath(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url));
const WORKER = readFileSync(WORKER_FILE, 'utf8');
const workerSet = name => [...WORKER.match(new RegExp(`^${name} = \\{([^}]*)\\}`, 'm'))[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return {
    server,
    cast: await server.ssrLoadModule('/src/doodle-cast.ts'),
    parts: await server.ssrLoadModule('/src/doodle-parts.ts'),
    draw: await server.ssrLoadModule('/src/doodle-draw.ts'),
    genres: await server.ssrLoadModule('/src/genres.ts'),
    pack: await server.ssrLoadModule('/src/creatives-pack.ts'),
  };
}

const VOICES = [null, 'female', 'male', 'both'];

test('every genre, voice and mood deals four singers the page can draw, none the same, in the order the voice asks for', async () => {
  const { server, cast, genres } = await load();
  try {
    for (const group of genres.GENRES) {
      for (const voice of VOICES) {
        for (const mood of ['joyful', 'flirty', 'boastful', 'angry', 'sad']) {
          const row = cast.dealDoodle(group.name, voice, mood, `seed-${group.name}-${voice}`);
          assert.equal(row.length, 4, `${group.name} ${voice}`);
          assert.equal(new Set(row.map(card => card.id)).size, 4, `${group.name} ${voice} repeats a singer: ${row.map(card => card.id)}`);
          for (const card of row) {
            assert.match(card.id, cast.DOODLE_ID_RULE, card.id);
            const singers = cast.singersOf(card.id);
            assert.ok(singers.length === 1 || singers.length === 2);
            assert.ok(card.label.length > 0);
            assert.ok(cast.DOODLE_PAPERS.includes(card.paper));
            assert.ok(cast.DOODLE_FACES.includes(card.font));
          }
          // The first card is the singer the voice asked for.
          const first = cast.singersOf(row[0].id);
          if (voice === 'female') assert.deepEqual(first.map(s => s.head), ['woman']);
          if (voice === 'male') assert.deepEqual(first.map(s => s.head), ['man']);
          if (voice === 'both') assert.deepEqual(first.map(s => s.head), ['woman', 'man']);
          // An unspoken voice still has both a woman and a man somewhere in the row.
          if (voice === null) {
            const heads = row.flatMap(card => cast.singersOf(card.id).map(s => s.head));
            assert.ok(heads.includes('woman') && heads.includes('man'), `${group.name}: ${heads}`);
          }
          // Four papers, one each.
          assert.equal(new Set(row.map(card => card.paper)).size, 4);
        }
      }
    }
  } finally { await server.close(); }
});

test('the genre decides what they carry, so no two genres dress their first singer the same', async () => {
  const { server, cast, genres } = await load();
  try {
    const looks = new Set();
    for (const group of genres.GENRES) {
      const [one] = cast.singersOf(cast.dealDoodle(group.name, 'female', 'joyful', 'x')[0].id);
      looks.add(JSON.stringify({ hair: one.hair, hat: one.hat, props: one.props }));
    }
    assert.equal(looks.size, genres.GENRES.length, 'every genre has its own look');
    assert.ok(cast.singersOf(cast.dealDoodle('Country & Folk', 'male', 'joyful', 'x')[0].id)[0].hat.includes('cowboy'));
    assert.ok(cast.singersOf(cast.dealDoodle('Electronic & Dance (EDM)', 'male', 'joyful', 'x')[0].id)[0].hat.includes('headphones'));
    assert.ok(cast.dealDoodle('a genre nobody listed', 'male', 'joyful', 'x').length === 4, 'an unknown genre still gets a row');
  } finally { await server.close(); }
});

test('some singers are animals, and a refresh deals a different hand', async () => {
  const { server, cast, parts } = await load();
  try {
    const animals = new Set();
    const hands = new Set();
    for (let generation = 0; generation < 12; generation++) {
      const row = cast.dealDoodle('Latin & Urbano', 'female', 'joyful', `song:${generation}`);
      hands.add(row.map(card => card.id).join(','));
      for (const card of row) for (const one of cast.singersOf(card.id)) if (parts.ANIMALS.includes(one.head)) animals.add(one.head);
      assert.ok(row.some(card => cast.singersOf(card.id).some(one => parts.ANIMALS.includes(one.head))), 'every row has an animal in it');
    }
    assert.ok(hands.size >= 4, `twelve refreshes dealt only ${hands.size} hands`);
    assert.ok(animals.size >= 3, `only ${[...animals]} appeared`);
    assert.deepEqual(cast.dealDoodle('Pop', 'male', 'sad', 's'), cast.dealDoodle('Pop', 'male', 'sad', 's'), 'the same song deals the same hand');
  } finally { await server.close(); }
});

test('every face feels what the words feel: a sad song has no cheerful card, an angry one no giggling', async () => {
  const { server, cast } = await load();
  try {
    assert.ok(cast.dealDoodle('Pop', null, 'sad', 'x').every(card => card.mood === 'sad'));
    assert.ok(cast.dealDoodle('Pop', null, 'angry', 'x').every(card => ['angry', 'boastful'].includes(card.mood)));
    for (const [attitude, mood] of [['heartbroken', 'sad'], ['lonely', 'sad'], ['angry', 'angry'], ['menacing', 'angry'], ['flirty', 'flirty'], ['boastful', 'boastful'], ['joyful', 'joyful'], ['neutral', 'joyful'], [null, 'joyful']]) {
      assert.equal(cast.doodleMood(attitude), mood, String(attitude));
    }
  } finally { await server.close(); }
});

test('the shelf has a Doodle row of four made of the lyrics, and the creator’s voice reaches it', async () => {
  const { server, pack } = await load();
  try {
    const row = pack.SHELF_ROWS.find(item => item.id === 'doodle');
    assert.deepEqual({ title: row.title, lyrics: row.lyrics, upload: row.upload }, { title: 'Doodle', lyrics: 'always', upload: undefined }, 'no picture goes into it');
    assert.ok(!pack.rowsFor(true).some(item => item.id === 'doodle'), 'a song with no words has no Doodle');
    const person = voice => ({
      version: 1,
      clip: { sourceSha256: 'a'.repeat(64), offsetMs: 0, durationMs: 15000 },
      creator: { primaryGenre: { value: 'Rock', source: 'creator' }, ...(voice && { voice: { value: voice, source: 'detected' } }) },
      musicAnalysis: { status: 'pending' },
      approvedLyrics: { cues: [{ text: 'hi', startMs: 0, endMs: 300 }], source: 'creator_reviewed' },
      lyricMeaning: { status: 'ready', meaning: { attitude: 'heartbroken', sadness: 3, intensity: 2 } },
    });
    const female = pack.recommendRow('doodle', person('female'), 0);
    assert.equal(female.length, 4);
    assert.ok(female.every(slot => slot.style === 'doodle' && slot.row === 'doodle' && slot.doodleId && slot.doodlePaper && slot.doodleMood === 'sad' && slot.grade === undefined));
    assert.match(female[0].doodleId, /^rock\.f\./);
    assert.match(pack.recommendRow('doodle', person('male'), 0)[0].doodleId, /^rock\.m\./);
    assert.match(pack.recommendRow('doodle', person('both'), 0)[0].doodleId, /^rock\.f\..*\+rock\.m\./);
    assert.notDeepEqual(female.map(slot => slot.id), pack.recommendRow('doodle', person('female'), 1).map(slot => slot.id), 'a refresh deals new cards');
    assert.equal(new Set(female.map(slot => slot.id)).size, 4);
  } finally { await server.close(); }
});

test('every part of a singer is strokes the drawing can read: nothing in the path data is left out', async () => {
  const { server, parts, draw } = await load();
  try {
    const all = {
      ...Object.fromEntries(Object.entries(parts.HEADS).map(([name, head]) => [`head ${name}`, head.draw])),
      ...Object.fromEntries(Object.entries(parts.HAIR).flatMap(([name, hair]) => [[`hair back ${name}`, hair.back], [`hair front ${name}`, hair.front]])),
      ...Object.fromEntries(Object.entries(parts.BEARDS).map(([name, svg]) => [`beard ${name}`, svg])),
      ...Object.fromEntries(Object.entries(parts.HATS).map(([name, svg]) => [`hat ${name}`, svg])),
      ...Object.fromEntries(Object.entries(parts.BODIES).map(([name, svg]) => [`body ${name}`, svg])),
      ...Object.fromEntries(Object.entries(parts.PROPS).map(([name, svg]) => [`prop ${name}`, svg])),
      neck: parts.NECK,
      'arm back woman': parts.ARM_BACK('woman'), 'arm back man': parts.ARM_BACK('man'),
      'arm front woman': parts.ARM_FRONT('woman'), 'arm front man': parts.ARM_FRONT('man'),
    };
    for (const mood of parts.DOODLE_MOODS) for (const [name, head] of Object.entries(parts.HEADS)) for (const talk of [0, 1]) all[`face ${name} ${mood} ${talk}`] = parts.moodFace(mood, head.face, talk);
    for (const [name, svg] of Object.entries(all)) {
      const tags = [...svg.matchAll(/<([a-z]+)/g)].map(match => match[1]);
      assert.ok(tags.every(tag => ['path', 'circle', 'ellipse', 'rect'].includes(tag)), `${name} uses ${tags}`);
      const ops = draw.strokes(svg);
      assert.equal(ops.length, tags.length, `${name}: ${tags.length} shapes but ${ops.length} strokes`);
      for (const op of ops) {
        for (const key of ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'lineWidth']) assert.ok(Number.isFinite(op[key] ?? 0), `${name} ${key}`);
        if (op.shape === 'path') assert.match(op.d, /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/, name);
      }
    }
  } finally { await server.close(); }
});

test('the cloud worker knows the Doodle papers, moods and hands the page deals', async () => {
  const { server, cast, parts, genres } = await load();
  try {
    assert.deepEqual(workerSet('DOODLE_PAPERS').sort(), [...cast.DOODLE_PAPERS].sort());
    assert.deepEqual(workerSet('DOODLE_MOODS').sort(), [...parts.DOODLE_MOODS].sort());
    assert.deepEqual(workerSet('DOODLE_FACES').sort(), [...cast.DOODLE_FACES].sort());
    assert.ok(workerSet('STYLES').includes('doodle'));
    // The worker's rule for a singer's name is the page's.
    assert.equal(WORKER.match(/^DOODLE_ID_RE = re\.compile\(r"(.*)"\)$/m)[1], cast.DOODLE_ID_RULE.source.replace(/\\\./g, '\\.'));
    void genres;
  } finally { await server.close(); }
});

const PROGRAM = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("worker", ${JSON.stringify(WORKER_FILE)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
answers = []
for case in json.load(sys.stdin):
    try:
        module.parse_meta(json.dumps({"opts": case["opts"]}))
        module.check_media(case["opts"], {name: b"x" for name in case["media"]})
        answers.append({"accepted": True})
    except ValueError as error:
        answers.append({"accepted": False, "error": str(error)})
print(json.dumps(answers))
`;

const base = {
  style: 'doodle', font: 'Permanent Marker', fontSecondary: 'Permanent Marker', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '',
  doodleId: 'latin.f.long', doodlePaper: 'ruled', doodleMood: 'joyful',
};
const card = (change, media = []) => ({ opts: { ...base, ...change }, media });
const cases = {
  single: [card({}), true],
  man: [card({ doodleId: 'rock.m.mohawk.none' }), true],
  animal: [card({ doodleId: 'country.a.donkey.m' }), true],
  duet: [card({ doodleId: 'pop.f.buns+pop.m.pomp.stache' }), true],
  otherHand: [card({ font: 'Caveat Brush', fontSecondary: 'Caveat Brush' }), true],
  noSinger: [card({ doodleId: undefined }), false],
  noPaper: [card({ doodlePaper: undefined }), false],
  noMood: [card({ doodleMood: undefined }), false],
  unknownPaper: [card({ doodlePaper: 'silk' }), false],
  unknownMood: [card({ doodleMood: 'smug' }), false],
  badId: [card({ doodleId: '../../etc/passwd' }), false],
  capitals: [card({ doodleId: 'Latin.f.long' }), false],
  tooLong: [card({ doodleId: `latin.f.${'a'.repeat(200)}` }), false],
  threeSingers: [card({ doodleId: 'a.f.long+b.f.long+c.f.long' }), false],
  notADoodleHand: [card({ font: 'Anton', fontSecondary: 'Anton' }), false],
  noSeed: [card({ layout: { rotate: 0, scaleBias: 1, cut: 0 } }), false],
  doodleKeysOnAnotherStyle: [card({ style: 'spray', sprayPalette: 'neon-night' }), false],
  withAPicture: [card({}, ['photo']), false],
};
const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker accepts the Doodle cards the page deals and refuses every mistake', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { input: JSON.stringify(Object.values(cases).map(([input]) => input)), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const answers = JSON.parse(run.stdout);
  Object.entries(cases).forEach(([name, [, accepted]], index) => assert.equal(answers[index].accepted, accepted, `${name}: ${JSON.stringify(answers[index])}`));
});
