import { FPS, FRAMES } from './composition';
import { sameClip, type ClipIdentity, type MusicAnalysisState } from './creative-profile';
import type { ExecutableEdit } from './director-plan';
import type { MediaAsset, MediaEdit } from './media-timeline';

export type MontageStyle = 'pulse' | 'contrast' | 'flow';
export const MONTAGE_STYLES: { id: MontageStyle; name: string }[] = [
  {id:'pulse',name:'Pulse Cut'}, {id:'contrast',name:'Long & Short'}, {id:'flow',name:'Flow'},
];
const TARGETS: Record<MontageStyle,number[]> = {
  pulse:[0,45,90,135,180,225,270,315,360,405,450],
  contrast:[0,30,120,150,240,270,360,390,450],
  flow:[0,90,180,270,360,450],
};

/** Keep the entire validated creator-supplied pool; cuts are planned below. */
export function localMontageBase(clip:ClipIdentity,assets:MediaAsset[]):MediaEdit {
  if(clip.durationMs!==15000 || assets.length<2 || assets.length>10 || new Set(assets.map(a=>a.id)).size!==assets.length || assets.some(a=>!a.id || !['image','video'].includes(a.type) || !a.url.startsWith('blob:'))) throw new Error('Choose at least two valid media files.');
  return {version:1,clip,durationMs:15000,assets:[...assets],shots:[{assetId:assets[0].id,startMs:0,endMs:15000,transition:'cut'}]};
}

/** Produce explicit integer-frame instructions from the existing validated edit. */
export function montageEdit<T extends MediaEdit | ExecutableEdit>(base:T, analysis:MusicAnalysisState, style:MontageStyle, movement:Record<string,number>):T {
  const target=TARGETS[style]; if (!target) throw new Error('Unknown montage style.');
  if(base.assets.length<2)throw new Error('At least two media files are needed for this montage.');
  const measured=analysis.status==='ready' && sameClip(analysis.clip,base.clip) ? analysis.result : null;
  const times=measured ? [...measured.rhythm.beatsMs,...measured.features.transientsMs].filter(t=>Number.isSafeInteger(t)&&t>=0&&t<15000).map(t=>Math.round(t*FPS/1000)) : [];
  const boundaries=[0];
  for(let i=1;i<target.length-1;i++) {
    const candidates=times.filter(frame=>Math.abs(frame-target[i])<=7 && frame>=boundaries[i-1]+20 && frame<=target[i+1]-20);
    candidates.sort((a,b)=>Math.abs(a-target[i])-Math.abs(b-target[i]) || a-b);boundaries.push(candidates[0]??target[i]);
  }
  boundaries.push(FRAMES);
  if(base.version===1){
    while(boundaries.length-1<base.assets.length){let index=0;for(let i=1;i<boundaries.length-1;i++)if(boundaries[i+1]-boundaries[i]>boundaries[index+1]-boundaries[index])index=i;const midpoint=boundaries[index]+Math.floor((boundaries[index+1]-boundaries[index])/2);if(midpoint<=boundaries[index]||midpoint>=boundaries[index+1])throw new Error('Too many files for this montage.');boundaries.splice(index+1,0,midpoint);}
  }
  if(base.version===2){
    const usable=base.assets.map(asset=>Math.max(0,...base.shots.filter(shot=>shot.assetId===asset.id).map(shot=>shot.sourceOutMs-shot.sourceInMs)));
    const maxFrames=Math.floor(Math.min(...usable)*FPS/1000);
    if(maxFrames<1)throw new Error('The selected footage is too short for this montage.');
    const safe=[0];for(let i=1;i<boundaries.length;i++){const start=boundaries[i-1],duration=boundaries[i]-start,parts=Math.ceil(duration/maxFrames);for(let part=1;part<=parts;part++)safe.push(start+Math.round(duration*part/parts));}
    boundaries.splice(0,boundaries.length,...safe);
  }
  const ranked=[...base.assets].sort((a,b)=>(movement[b.id]??0)-(movement[a.id]??0) || a.id.localeCompare(b.id));
  if(style==='flow') ranked.reverse();
  if(style==='contrast') { const sorted=[...ranked]; ranked.length=0; while(sorted.length){ranked.push(sorted.shift()!);if(sorted.length)ranked.push(sorted.pop()!);} }
  if(ranked.length<2)throw new Error('At least two media files are needed for this montage.');
  if(base.version===2){
    const ranges=new Map<string,typeof base.shots>();for(const shot of base.shots){const entries=ranges.get(shot.assetId)??[];entries.push(shot);ranges.set(shot.assetId,entries);}let previous='';
    const used=new Set<string>();
    const shots=boundaries.slice(0,-1).map((startFrame,i)=>{
      const endFrame=boundaries[i+1],length=Math.ceil((endFrame-startFrame)*1000/FPS);
      const candidates=ranked.filter(a=>(ranges.get(a.id)??[]).some(r=>r.sourceOutMs-r.sourceInMs>=length));
      if(!candidates.length)throw new Error('The selected footage is too short for this montage.');
      // Densify the director timeline: keep the planned asset for this frame instead of A-B-C rotating.
      const planned=base.shots.find(s=>startFrame>=s.startFrame && startFrame<s.endFrame)?.assetId;
      const plannedOk=planned && candidates.some(a=>a.id===planned) ? candidates.find(a=>a.id===planned)! : null;
      const fresh=candidates.find(a=>!used.has(a.id) && a.id!==previous);
      const preferred=plannedOk || fresh || candidates.find(a=>a.id!==previous) || candidates[0];
      const chosen=preferred;
      const sameAsPrevious=chosen.id===previous;previous=chosen.id;used.add(chosen.id);
      if(used.size>=candidates.length) used.clear();
      const options=ranges.get(chosen.id)!.filter(r=>r.sourceOutMs-r.sourceInMs>=length);const original=options[i%options.length];const spare=original.sourceOutMs-original.sourceInMs-length;
      // Walk source windows so reuse is a new segment, not the same three frames.
      const sourceInMs=original.sourceInMs+Math.floor(spare*((i*5)%7)/7);
      const dissolve=i>0 && !sameAsPrevious && (style==='flow'||(style==='contrast'&&i%2===0));
      return {assetId:chosen.id,startFrame,endFrame,sourceInMs,sourceOutMs:sourceInMs+length,transition:{type:dissolve?'dissolve' as const:'cut' as const,durationFrames:dissolve?Math.min(9,endFrame-startFrame):0},crop:{...original.crop}};
    });
    const motion=base.motion.map(item=>({...item,intensity:Math.min(1,item.intensity*(style==='pulse'?1:style==='contrast'?.7:.45))}));
    return {...base,shots,motion} as T;
  }
  const shots=boundaries.slice(0,-1).map((startFrame,i)=>{
    const endFrame=boundaries[i+1], transition=i===0?'cut':style==='flow'||(style==='contrast'&&i%2===0)?'dissolve':style==='pulse' && measured?.features.transientsMs.some(ms=>Math.abs(ms-startFrame*1000/FPS)<100)?'impact':'cut';
    const assetId=ranked[i%ranked.length].id,sourceStartMs=base.shots.find(shot=>shot.assetId===assetId)?.sourceStartMs??0;
    return {assetId,startFrame,endFrame,startMs:Math.round(startFrame*1000/FPS),endMs:Math.round(endFrame*1000/FPS),sourceStartMs,transition} as const;
  });
  return {...base,shots} as T;
}
