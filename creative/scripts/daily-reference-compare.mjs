// Local-only visual aid. Reference images and comparisons can contain third-party
// artwork or personal information; never publish them without verified rights.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const [reference, rendered, destination] = process.argv.slice(2);
if (!reference || !rendered || !destination || process.argv.length !== 5) {
  console.error('Usage: node scripts/daily-reference-compare.mjs <reference> <rendered> <private-output.png>');
  process.exit(2);
}
const output = resolve(destination);
if (output === resolve(reference) || output === resolve(rendered)) throw new Error('Output must differ from both inputs.');
// Preserve aspect ratios, including provider footer, so mismatched dimensions
// and cropping remain visible to the reviewer instead of silently stretching.
const panel = 'scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:white,setsar=1';
execFileSync(ffmpeg.path, ['-v', 'error', '-y', '-i', resolve(reference), '-i', resolve(rendered), '-filter_complex', `[0:v]${panel}[a];[1:v]${panel}[b];[a][b]hstack=inputs=2`, '-frames:v', '1', output], { stdio: 'inherit' });
console.log(`Private comparison saved to ${output}; inspect it visually and record aspect-ratio differences.`);
