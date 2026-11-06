import { trace } from './staging-diagnostics';
import type { buildVisionMusicProfile } from './vision-music-profile';
type Profile=NonNullable<ReturnType<typeof buildVisionMusicProfile>>;
export type VisionBrief={id:string;label:string;concept:string;treatment:string;direction?:unknown;candidateIds?:string[]};
type State={
  status:string;
  phase?:string;
  jobId?:string;
  ticket?:string;
  result?:unknown;
  error?:string;
  sources?:unknown;
  briefs?:VisionBrief[];
  selectedBrief?:{id:string;label:string;treatment:string};
  vimeoDiscovery?:unknown;
};
async function request(body:unknown,token:string,signal:AbortSignal):Promise<State>{
  const response=await fetch('/api/media-catalog',{method:'POST',headers:{'Content-Type':'application/json','X-Mumoo-Brain-Access':token},body:JSON.stringify(body),signal});
  const data=await response.json().catch(()=>null) as State|null;
  if(!response.ok || !data)throw new Error((data && typeof data.error==='string' && data.error) || 'Visual intelligence is unavailable.');
  return data;
}
function delay(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Canceled','AbortError'));return;}const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);function cancel(){clearTimeout(timer);reject(new DOMException('Canceled','AbortError'));}signal.addEventListener('abort',cancel,{once:true});});}

export async function runVisionResearch(
  profile:Profile,
  token:string,
  signal:AbortSignal,
  onStage:(stage:string)=>void,
  options:{directionIndex?:number;excludeIds?:string[];onBriefs?:(briefs:VisionBrief[])=>void}={},
){
  const started=performance.now();onStage('Developing visual directions…');
  let state=await request({operation:'vision-start',profile},token,signal);let previous='';
  for(let attempt=0;attempt<120;attempt++){
    if(signal.aborted) throw new DOMException('Canceled','AbortError');
    if(state.status==='briefs' && Array.isArray(state.briefs) && state.briefs.length>=2 && state.jobId && state.ticket){
      options.onBriefs?.(state.briefs);
      onStage('Matching footage to your direction…');
      trace('vision_phase',{category:'briefs'});
      state=await request({
        operation:'vision-poll',
        profile,
        phase:'briefs',
        jobId:state.jobId,
        ticket:state.ticket,
        directionIndex:options.directionIndex ?? 0,
        ...(options.excludeIds?.length ? {excludeIds:options.excludeIds.slice(0,24)} : {}),
      },token,signal);
      previous='vision';
      continue;
    }
    if(state.status==='ready' && state.result){
      trace('vision_result',{category:'ready',durationMs:Math.round(performance.now()-started)});
      return state.result;
    }
    if(state.status==='unavailable') throw new Error(state.error || 'Not enough matching footage was found.');
    if(state.status!=='pending' || !state.jobId || !state.ticket || !['direction','vision'].includes(state.phase||'')){
      throw new Error(state.error || 'Visual planning returned an invalid result.');
    }
    if(previous!==state.phase){
      previous=state.phase||'';
      onStage(previous==='vision'?'Examining footage and composing your video…':'Developing visual directions…');
      trace('vision_phase',{category:previous});
    }
    await delay(12000,signal);
    state=await request({operation:'vision-poll',profile,phase:state.phase,jobId:state.jobId,ticket:state.ticket},token,signal);
  }
  throw new Error('Visual intelligence could not complete the video.');
}
