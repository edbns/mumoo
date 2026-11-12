/**
 * A person's video or GIF is not played from its start. Its shots (found when it was prepared) are arranged into
 * a 15-second edit that cuts on the beat, and each card gets a different arrangement: the same pictures, cut four
 * ways. This is the Director (`pack-director.ts`) given one clip. The plan is a pure function of the shots, the
 * music and a seed, so the shelf preview and the cloud render make exactly the same edit.
 */
import { clipMsAt, planReel, type DirectorMusic, type Shot } from './pack-director';

export type { Shot } from './pack-director';
export type Cut = {
  /** When in the song this piece starts. */
  atMs: number;
  /** The piece of the video it plays, and where inside it the playing starts. */
  startMs: number;
  endMs: number;
  fromMs: number;
};

export function planCuts(shots: readonly Shot[], beatsMs: readonly number[], seed: number, durationMs: number, music?: Pick<DirectorMusic, 'downbeatsMs' | 'energy' | 'accentsMs' | 'pace'> | null): Cut[] {
  const direction: DirectorMusic = { beatsMs, downbeatsMs: music?.downbeatsMs, energy: music?.energy ?? [], accentsMs: music?.accentsMs, pace: music?.pace };
  return planReel([{ kind: 'clip', shots }], direction, seed, durationMs).map(({ atMs, startMs, pieceEndMs, fromMs }) => ({ atMs, startMs, endMs: pieceEndMs, fromMs }));
}

/** Where in the video the picture comes from at `ms` of the song. A piece shorter than its slot loops. */
export function sourceMsAt(cuts: readonly Cut[], ms: number): number {
  let cut = cuts[0];
  for (const candidate of cuts) if (candidate.atMs <= ms) cut = candidate;
  return clipMsAt({ atMs: cut.atMs, endMs: 0, asset: 0, startMs: cut.startMs, pieceEndMs: cut.endMs, fromMs: cut.fromMs, zoom: [1, 1] }, ms);
}
