import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The cloud worker checks every Window card strictly before it spends a render on it. This runs the worker's own
 * checks (`parse_meta`, `check_media`) on cards the page deals and on every kind of mistake. Skipped where Python
 * and Modal are not installed.
 */
const worker = fileURLToPath(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url));

const PROGRAM = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("worker", ${JSON.stringify(worker)})
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

const base = { style: 'window', font: 'Anton', fontSecondary: 'Anton', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '', windowMode: 'plain', windowPalette: 'black', windowAllowed: ['black'], plateId: 'burnnet-woman-1547507-1920' };
const card = (change, media = []) => ({ opts: { ...base, ...change }, media });
const REEL = [{ kind: 'clip', url: 'https://bucket.r2.cloudflarestorage.com/a.mp4' }, { kind: 'photo', url: 'https://bucket.r2.cloudflarestorage.com/b.jpg' }];

const cases = {
  oursPlain: [card({}), true],
  offWhite: [card({ windowPalette: 'off-white', windowAllowed: ['off-white'] }), true],
  directorReel: [card({ plateId: undefined, reel: REEL }), true],
  reelWithMedia: [card({ plateId: undefined, reel: REEL }, ['motion']), false],
  reelAndPlate: [card({ reel: REEL }), false],
  ownPhoto: [card({ plateId: undefined }, ['photo']), true],
  ownClip: [card({ plateId: undefined }, ['motion']), true],
  ownPhotoWithCutout: [card({ plateId: undefined }, ['photo', 'cutout']), false],
  noMode: [card({ windowMode: undefined }), false],
  oldPersonMode: [card({ windowMode: 'person' }), false],
  oldEffectMode: [card({ windowMode: 'effect', plateId: undefined, effectId: 'tropical-ascii-cam-1' }), false],
  oldBankMode: [card({ windowMode: 'bank', plateId: undefined, bankId: 'any-look' }), false],
  noPalette: [card({ windowPalette: undefined }), false],
  colouredScreen: [card({ windowPalette: 'cobalt', windowAllowed: ['cobalt'] }), false],
  paletteNotAllowed: [card({ windowPalette: 'off-white', windowAllowed: ['black'] }), false],
  emptyAllowed: [card({ windowAllowed: [] }), false],
  repeatedAllowed: [card({ windowAllowed: ['black', 'black'] }), false],
  unknownFace: [card({ font: 'Oswald', fontSecondary: 'Oswald' }), false],
  noSeed: [card({ layout: { rotate: 0, scaleBias: 1, cut: 0 } }), false],
  windowKeysOnAnotherStyle: [card({ style: 'dust' }), false],
  oursAndOwn: [card({}, ['photo']), false],
  effectOnPlain: [card({ effectId: 'tropical-ascii-cam-1' }), false],
  nothing: [card({ plateId: undefined }), false],
  silhouetteRed: [card({ windowMode: 'silhouette', windowShape: 'man-cap', windowPalette: 'red', windowAllowed: ['red'] }), true],
  silhouetteReel: [card({ windowMode: 'silhouette', windowShape: 'woman-wide', plateId: undefined, reel: REEL }), true],
  silhouetteNoShape: [card({ windowMode: 'silhouette' }), false],
  silhouetteUnknownShape: [card({ windowMode: 'silhouette', windowShape: 'dog' }), false],
  shapeOnPlain: [card({ windowShape: 'man-cap' }), false],
  redOnPlain: [card({ windowPalette: 'red', windowAllowed: ['red'] }), false],
  shapeOnAnotherStyle: [card({ style: 'dust', windowMode: undefined, windowPalette: undefined, windowAllowed: undefined, windowShape: 'man-cap' }), false],
};

const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker accepts the Window cards the page deals and refuses every mistake', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { input: JSON.stringify(Object.values(cases).map(([input]) => input)), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const answers = JSON.parse(run.stdout);
  Object.entries(cases).forEach(([name, [, accepted]], index) => assert.equal(answers[index].accepted, accepted, `${name}: ${JSON.stringify(answers[index])}`));
});
