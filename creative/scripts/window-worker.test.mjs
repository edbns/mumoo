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

const base = { style: 'window', font: 'Anton', fontSecondary: 'Anton', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '', windowMode: 'plain', windowPalette: 'black', windowAllowed: ['black', 'cobalt'], plateId: 'burnnet-woman-1547507-1920' };
const card = (change, media = []) => ({ opts: { ...base, ...change }, media });

const cases = {
  oursPlain: [card({}), true],
  oursPerson: [card({ windowMode: 'person' }), true],
  oursEffect: [card({ windowMode: 'effect', plateId: undefined, effectId: 'tropical-ascii-cam-1' }), true],
  oursBank: [card({ windowMode: 'bank', plateId: undefined, bankId: 'any-look' }), true],
  ownPlainPhoto: [card({ plateId: undefined }, ['photo', 'cutout']), true],
  ownPerson: [card({ windowMode: 'person', plateId: undefined }, ['photo', 'cutout']), true],
  ownClip: [card({ plateId: undefined }, ['motion']), true],
  ownPhotoWithoutCutout: [card({ plateId: undefined }, ['photo']), false],
  noMode: [card({ windowMode: undefined }), false],
  unknownMode: [card({ windowMode: 'sepia' }), false],
  noPalette: [card({ windowPalette: undefined }), false],
  unknownPalette: [card({ windowPalette: 'chartreuse-ish', windowAllowed: ['chartreuse-ish'] }), false],
  paletteNotAllowed: [card({ windowPalette: 'cobalt', windowAllowed: ['black'] }), false],
  emptyAllowed: [card({ windowAllowed: [] }), false],
  repeatedAllowed: [card({ windowAllowed: ['black', 'black'] }), false],
  unknownFace: [card({ font: 'Oswald', fontSecondary: 'Oswald' }), false],
  noSeed: [card({ layout: { rotate: 0, scaleBias: 1, cut: 0 } }), false],
  windowKeysOnAnotherStyle: [card({ style: 'dust' }), false],
  personWithClip: [card({ windowMode: 'person', plateId: undefined }, ['motion']), false],
  effectWithOwnPhoto: [card({ windowMode: 'effect', plateId: undefined, effectId: 'tropical-ascii-cam-1' }, ['photo', 'cutout']), false],
  bankWithOwnClip: [card({ windowMode: 'bank', plateId: undefined, bankId: 'any-look' }, ['motion']), false],
  oursAndOwn: [card({}, ['photo', 'cutout']), false],
  twoOfOurs: [card({ effectId: 'tropical-ascii-cam-1' }), false],
  nothing: [card({ plateId: undefined }), false],
};

const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker accepts the Window cards the page deals and refuses every mistake', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { input: JSON.stringify(Object.values(cases).map(([input]) => input)), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const answers = JSON.parse(run.stdout);
  Object.entries(cases).forEach(([name, [, accepted]], index) => assert.equal(answers[index].accepted, accepted, `${name}: ${JSON.stringify(answers[index])}`));
});
