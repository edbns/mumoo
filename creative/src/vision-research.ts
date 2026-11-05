import { trace } from './staging-diagnostics';
import type { buildVisionMusicProfile } from './vision-music-profile';
type Profile=NonNullable<ReturnType<typeof buildVisionMusicProfile>>;
type State={ status:string; phase?:string; jobId?:string; ticket?:string; result?:unknown; error?:string; sources?:unknown };
async function request(body:unknown,token:string,signal:AbortSignal):Promise<State>{
  const response=await fetch('/api/media-catalog',{method:'POST',headers:{'Content-Type':'application/json','X-Mumoo-Brain-Access':token},body:JSON.stringify(body),signal});
  const data=await response.json().catch(()=>null) as State|null;
  if(!response.ok || !data)throw new Error(data?.error || 'Visual intelligence is unavailable.');
  return data;
}
function delay(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Canceled','AbortError'));return;}const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);function cancel(){clearTimeout(timer);reject(new DOMException('Canceled','AbortError'));}signal.addEventListener('abort',cancel,{once:true});});}
export async function runVisionResearch(profile:Profile,token:string,signal:AbortSignal,onStage:(stage:string)=>void){
  const started=performance.now();onStage('Developing a visual direction…');
  let state=await request({operation:'vision-start',profile},token,signal);let previous='';
  for(let attempt=0;attempt<120 && state.status==='pending';attempt++){
    if(!state.jobId||!state.ticket||!['direction','vision'].includes(state.phase||''))throw new Error('Visual planning returned an invalid result.');
    if(previous!==state.phase){previous=state.phase||'';onStage(previous==='vision'?'Examining footage and composing your video…':'Developing a visual direction…');trace('vision_phase',{category:previous});}
    await delay(12000,signal);
    state=await request({operation:'vision-poll',profile,phase:state.phase,jobId:state.jobId,ticket:state.ticket},token,signal);
  }
  trace('vision_result',{category:state.status,durationMs:Math.round(performance.now()-started)});
  if(state.status!=='ready'||!state.result)throw new Error(state.error || 'Visual intelligence could not complete the video.');
  return state.result;
}
