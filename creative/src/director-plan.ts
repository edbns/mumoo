import { DURATION_MS, FPS, FRAMES, type Composition } from './composition';
import type { ClipIdentity } from './creative-profile';
import type { MediaAsset } from './media-timeline';

export interface DirectorShot {
  assetId: string; startFrame: number; endFrame: number; sourceInMs: number; sourceOutMs: number;
  transition: { type: 'cut' | 'dissolve'; durationFrames: number };
  crop: { mode: 'cover'; x: number; y: number };
}
export interface DirectorMotion { startFrame: number; endFrame: number; intensity: number }
export interface ExecutableEdit {
  version: 2; clip: ClipIdentity; fps: typeof FPS; durationFrames: typeof FRAMES; seed: number;
  lyrics: { source: 'none' | 'approved-local-cues' }; motion: DirectorMotion[]; shots: DirectorShot[]; assets: MediaAsset[];
}
const keys = (value: unknown, expected: string[]): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...expected].sort().join('|'));
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const unit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Only the explicitly supported execution contract crosses into the renderer. */
export function directorExecutionEdit(clip: ClipIdentity, blueprint: unknown, loaded: Map<string, string>, composition: Composition, expectedClipSha256: string): ExecutableEdit {
  if (clip.durationMs !== DURATION_MS || composition.sourceSha256 !== clip.sourceSha256 || composition.clipStartMs !== clip.offsetMs) throw new Error('The director plan does not match the selected music.');
  if (!blueprint || typeof blueprint !== 'object') throw new Error('Director plan unavailable.');
  const b = blueprint as Record<string, unknown>;
  if (b.version !== 1 || b.status !== 'ready' || b.scope !== 'staging-test-only' || b.durationMs !== DURATION_MS || !Array.isArray(b.assets) || b.assets.length < 2 || b.assets.length > 4) throw new Error('Unsupported director plan.');
  const assets: MediaAsset[] = b.assets.map((asset: unknown) => {
    if (!asset || typeof asset !== 'object') throw new Error('Invalid media.');
    const a = asset as Record<string, unknown>;
    if (typeof a.id !== 'string' || !/^(?:pixabay|vimeo)-\d+$/.test(a.id) || a.type !== 'video' || a.rights !== 'STAGING_TEST_ONLY' || a.adSafety !== 'REVIEW_REQUIRED' || typeof a.title !== 'string') throw new Error('Media is not available for this staging test.');
    const url = loaded.get(a.id); if (!url?.startsWith('blob:')) throw new Error('Media was not loaded securely.');
    return { id:a.id, type:'video', title:a.title, url };
  });
  if (new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('Duplicate media.');
  const p = b.executionPlan;
  if (!keys(p,['version','clipSha256','fps','durationFrames','seed','lyrics','motion','shots']) || p.version !== 2 || !/^[a-f0-9]{64}$/.test(expectedClipSha256) || p.clipSha256 !== expectedClipSha256 || p.fps !== FPS || p.durationFrames !== FRAMES || !integer(p.seed) || p.seed < 0 || p.seed > 2147483647 || !keys(p.lyrics,['source']) || !['none','approved-local-cues'].includes(String(p.lyrics.source)) || !Array.isArray(p.motion) || !Array.isArray(p.shots)) throw new Error('Unsupported execution plan.');
  const cues = composition.version === 1 ? [composition.lyric] : composition.cues;
  if ((p.lyrics.source === 'none' && cues.length > 0) || (p.lyrics.source === 'approved-local-cues' && !cues.length)) throw new Error('Lyric cues do not match the execution plan.');
  if (p.shots.length !== assets.length || p.motion.length < 1 || p.motion.length > 15) throw new Error('Invalid plan coverage.');
  let next = 0;
  const shots: DirectorShot[] = p.shots.map((shot: unknown, index: number) => {
    if (!keys(shot,['assetId','startFrame','endFrame','sourceInMs','sourceOutMs','transition','crop']) || typeof shot.assetId !== 'string' || !assets.some(a=>a.id===shot.assetId) || !integer(shot.startFrame) || !integer(shot.endFrame) || shot.startFrame!==next || shot.endFrame<=shot.startFrame || shot.endFrame>FRAMES || !integer(shot.sourceInMs) || !integer(shot.sourceOutMs) || shot.sourceInMs<0 || shot.sourceOutMs-shot.sourceInMs!==Math.ceil((shot.endFrame-shot.startFrame)*1000/FPS) || !keys(shot.transition,['type','durationFrames']) || !keys(shot.crop,['mode','x','y']) || shot.crop.mode!=='cover' || !unit(shot.crop.x) || !unit(shot.crop.y)) throw new Error('Invalid shot instruction.');
    const t=shot.transition;
    if (!['cut','dissolve'].includes(String(t.type)) || !integer(t.durationFrames) || (t.type==='cut' && t.durationFrames!==0) || (t.type==='dissolve' && (index===0 || t.durationFrames<1 || t.durationFrames>30 || t.durationFrames>shot.endFrame-shot.startFrame))) throw new Error('Unsupported transition.');
    next=shot.endFrame;
    return {assetId:shot.assetId,startFrame:shot.startFrame,endFrame:shot.endFrame,sourceInMs:shot.sourceInMs,sourceOutMs:shot.sourceOutMs,transition:{type:t.type as 'cut'|'dissolve',durationFrames:t.durationFrames},crop:{mode:'cover',x:shot.crop.x,y:shot.crop.y}};
  });
  if(next!==FRAMES || new Set(shots.map(shot => shot.assetId)).size !== assets.length) throw new Error('Incomplete shot timeline.');
  // The legacy diagnostic shot list must never contradict the executable plan.
  if (b.shots !== undefined) {
    if (!Array.isArray(b.shots) || b.shots.length !== shots.length || b.shots.some((raw: unknown, i: number) => {
      if (!raw || typeof raw !== 'object') return true;
      const old = raw as Record<string, unknown>, shot = shots[i];
      return old.assetId !== shot.assetId || old.startFrame !== shot.startFrame || old.endFrame !== shot.endFrame || old.sourceStartMs !== shot.sourceInMs || old.transition !== shot.transition.type;
    })) throw new Error('Director instructions do not agree.');
  }
  next=0;
  const motion: DirectorMotion[] = p.motion.map((item: unknown)=>{
    if(!keys(item,['startFrame','endFrame','intensity']) || !integer(item.startFrame) || !integer(item.endFrame) || item.startFrame!==next || item.endFrame<=item.startFrame || item.endFrame>FRAMES || !unit(item.intensity)) throw new Error('Invalid motion timeline.');
    next=item.endFrame; return {startFrame:item.startFrame,endFrame:item.endFrame,intensity:item.intensity};
  });
  if(next!==FRAMES) throw new Error('Incomplete motion timeline.');
  return {version:2,clip,fps:FPS,durationFrames:FRAMES,seed:p.seed,lyrics:{source:p.lyrics.source as 'none'|'approved-local-cues'},motion,shots,assets};
}

/** 1 intensity unit equals a maximum 2% linear zoom over a shot. */
export function directorFrame(edit: ExecutableEdit, frame: number) {
  if(!integer(frame)||frame<0||frame>=FRAMES) throw new Error('Invalid frame.');
  const index=edit.shots.findIndex(s=>frame>=s.startFrame && frame<s.endFrame), shot=edit.shots[index];
  if(!shot) throw new Error('Missing shot.');
  const segment=edit.motion.find(s=>frame>=s.startFrame && frame<s.endFrame); if(!segment) throw new Error('Missing motion.');
  const progress=(frame-shot.startFrame)/Math.max(1,shot.endFrame-shot.startFrame-1);
  const amount=edit.seed%2===0?progress:1-progress;
  const mix=shot.transition.type==='dissolve'?Math.min(1,(frame-shot.startFrame)/shot.transition.durationFrames):1;
  return {frame,index,shot,previous:index>0?edit.shots[index-1]:null,mix,scale:1+0.02*segment.intensity*amount,sourceMs:shot.sourceInMs+(frame-shot.startFrame)*1000/FPS};
}
