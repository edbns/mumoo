import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { validAccess } from '../functions/brain-gateway.mjs';
const SITE='097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', ORIGIN='https://mumoo-staging.netlify.app';
const BRAIN='https://mumoo-brain-staging.netlify.app/api/media';
const SUBMIT='https://edbns-mumoo-staging--mumoo-visual-intelligence-staging-submit.us-east.modal.run';
const STATUS='https://edbns-mumoo-staging--mumoo-visual-intelligence-staging-status.us-east.modal.run';
const reply=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const ticket=(secret,id,phase,profile)=>createHmac('sha256',secret).update(`${id}:${phase}:${digest(profile)}`).digest('hex');
const isJob=id=>typeof id==='string' && /^fc-[A-Za-z0-9]+$/.test(id);
async function send(url,secret,value,timeout=20000){return fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),headers:{'content-type':'application/json',authorization:`Bearer ${secret}`},body:JSON.stringify(value)});}
async function processRequest(request){
 if(process.env.SITE_ID!==SITE || new URL(request.url).origin!==ORIGIN) return reply(404,{error:'Not available.'});
 if(request.method!=='POST') return reply(405,{error:'Use POST.'});
 if(request.headers.get('origin')!==ORIGIN) return reply(403,{error:'Open MUMOO Staging.'});
 if(!validAccess(request.headers.get('x-mumoo-brain-access')||'',process.env.MUMOO_BRAIN_TESTER_KEY)) return reply(401,{error:'Staging access is invalid or expired.'});
 const bridge=process.env.MUMOO_MUSIC_BRIDGE_SECRET||'', brain=process.env.MUMOO_BRAIN_SERVICE_SECRET||'';
 if(bridge.length<32 || brain.length<32) return reply(503,{error:'Vision research is unavailable.'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) return reply(415,{error:'Expected JSON.'});
 if(Number(request.headers.get('content-length'))>32000) return reply(413,{error:'Request too large.'});
 const bytes=await request.arrayBuffer(); if(bytes.byteLength>32000) return reply(413,{error:'Request too large.'});
 let body; try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'Invalid request.'});}
 if(!body || typeof body!=='object' || Array.isArray(body) || !body.profile || body.profile.version!==1 || body.profile.durationMs!==15000 || !['visual','lyric'].includes(body.profile.videoType) || !/^[a-f0-9]{64}$/.test(body.profile.clipSha256||'') || !Array.isArray(body.profile.lyricCues) || (body.profile.videoType==='visual' && body.profile.lyricCues.length)) return reply(400,{error:'Invalid music profile.'});
 if(body.operation==='vision-start'){
  if(Object.keys(body).some(k=>!['operation','profile'].includes(k))) return reply(400,{error:'Invalid request.'});
  const r=await send(SUBMIT,bridge,{action:'direction',payload:{profile:body.profile}}); if(!r.ok)return reply(r.status===429?429:502,{error:'Visual planning unavailable.'});
  const data=await r.json(); if(!isJob(data.jobId)) return reply(502,{error:'Visual planning unavailable.'});
  return reply(200,{status:'pending',phase:'direction',jobId:data.jobId,ticket:ticket(bridge,data.jobId,'direction',body.profile)});
 }
 if(body.operation!=='vision-poll' || Object.keys(body).some(k=>!['operation','profile','phase','jobId','ticket'].includes(k)) || !['direction','vision'].includes(body.phase) || !isJob(body.jobId) || typeof body.ticket!=='string' || !/^[a-f0-9]{64}$/.test(body.ticket)) return reply(400,{error:'Invalid request.'});
 const expected=Buffer.from(ticket(bridge,body.jobId,body.phase,body.profile),'hex'), supplied=Buffer.from(body.ticket,'hex');
 if(expected.length!==supplied.length || !timingSafeEqual(expected,supplied)) return reply(403,{error:'Invalid staging job.'});
 const poll=await send(STATUS,bridge,{jobId:body.jobId}); if(poll.status===202)return reply(200,{status:'pending',phase:body.phase,jobId:body.jobId,ticket:body.ticket});
 if(!poll.ok)return reply(502,{error:body.phase==='direction'?'Visual planning failed.':'Footage analysis failed.'});
 const data=await poll.json(); if(data.status!=='ready' || data.action!==(body.phase==='direction'?'direction':'analyze'))return reply(502,{error:'Vision result unavailable.'});
 if(body.phase==='vision') return reply(200,{status:'ready',result:data.result});
 const direction=data.result?.direction;
 const search=await send(BRAIN,brain,{operation:'vision-search',direction},50000);if(!search.ok)return reply(502,{error:'Pixabay search unavailable.'});
 const found=await search.json();if(!Array.isArray(found.candidates)||found.candidates.length<3)return reply(200,{status:'unavailable',error:'Not enough matching Pixabay footage was found.',sources:found.sources||[]});
 const candidates=found.candidates.filter(c=>Number.isSafeInteger(c.durationMs)&&c.durationMs>=6000).slice(0,36);
 if(candidates.length<3)return reply(200,{status:'unavailable',error:'Not enough usable Pixabay videos were found.',sources:found.sources||[]});
 const start=await send(SUBMIT,bridge,{action:'analyze',payload:{profile:body.profile,direction,candidates,sources:found.sources,planning:{provenance:data.result.provenance,timings:data.result.timings}}});if(!start.ok)return reply(start.status===429?429:502,{error:'Footage analysis unavailable.'});
 const next=await start.json();if(!isJob(next.jobId))return reply(502,{error:'Footage analysis unavailable.'});
 return reply(200,{status:'pending',phase:'vision',jobId:next.jobId,ticket:ticket(bridge,next.jobId,'vision',body.profile)});
}
export default async function handler(request){
 const started=Date.now(),requestId=randomUUID();let result;
 try{result=await processRequest(request);}catch{result=reply(503,{error:'Vision research is unavailable.'});}
 console.info(JSON.stringify({event:'vision_gateway',requestId,time:new Date(started).toISOString(),status:result.status,durationMs:Date.now()-started}));result.headers.set('X-Mumoo-Request-Id',requestId);return result;
}
