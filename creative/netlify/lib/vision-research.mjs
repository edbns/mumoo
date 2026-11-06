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

function normalizeBriefs(result) {
  if (Array.isArray(result?.directions) && result.directions.length >= 2) {
    return result.directions.slice(0, 3).map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `d${index + 1}`,
      label: typeof item.label === 'string' ? item.label : (item.concept || `Direction ${index + 1}`),
      concept: typeof item.concept === 'string' ? item.concept : (item.label || `Direction ${index + 1}`),
      treatment: ['kinetic', 'restrained', 'balanced'].includes(item.treatment) ? item.treatment : (['kinetic', 'restrained', 'balanced'][index] || 'balanced'),
      direction: item.direction || result.direction,
      candidateIds: Array.isArray(item.candidateIds) ? item.candidateIds.slice(0, 8) : [],
    })).filter(item => item.direction);
  }
  if (result?.direction) {
    const base = result.direction;
    const kinetic = base;
    const restrained = {
      ...base,
      interpretation: `${String(base.interpretation || 'Alternate hold').slice(0, 200)} Restrained hold.`,
      subjects: Array.isArray(base.environments) && base.environments.length ? base.environments.slice(0, 3) : base.subjects,
      environments: Array.isArray(base.subjects) && base.subjects.length ? base.subjects.slice(0, 3) : base.environments,
      movement: ['slow', 'held'].slice(0, Math.max(1, (base.movement || []).length)),
      aesthetic: Array.isArray(base.aesthetic) ? [...base.aesthetic].reverse() : base.aesthetic,
    };
    return [
      { id: 'd1', label: 'Kinetic', concept: 'Kinetic', treatment: 'kinetic', direction: kinetic, candidateIds: [] },
      { id: 'd2', label: 'Restrained', concept: 'Restrained', treatment: 'restrained', direction: restrained, candidateIds: [] },
    ];
  }
  return [];
}

function validProfile(profile) {
  if (!profile || profile.version !== 1 || profile.durationMs !== 15000 || !['visual', 'lyric'].includes(profile.videoType) || !/^[a-f0-9]{64}$/.test(profile.clipSha256 || '') || !Array.isArray(profile.lyricCues)) return false;
  if (profile.videoType === 'visual' && profile.lyricCues.length !== 0) return false;
  if (profile.lyricCues.length > 40) return false;
  for (const cue of profile.lyricCues) {
    if (!cue || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 120 || !Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs < 0 || cue.endMs <= cue.startMs || cue.endMs > 15000) return false;
  }
  return true;
}

async function startAnalyze(brain, bridge, profile, brief, briefs, excludeIds, planningBase) {
  const search = await send(BRAIN, brain, { operation: 'vision-search', direction: brief.direction, ...(excludeIds.length ? { excludeIds } : {}) }, 50000);
  if (!search.ok) return reply(502, { error: 'Footage search unavailable.' });
  const found = await search.json();
  if (!Array.isArray(found.candidates) || found.candidates.length < 3) {
    return reply(200, { status: 'unavailable', error: 'Not enough matching footage was found for this direction.', sources: found.sources || [], briefs, vimeoDiscovery: found.vimeoDiscovery || null });
  }
  const candidates = found.candidates.filter(c => Number.isSafeInteger(c.durationMs) && c.durationMs >= 6000 && typeof c.renderUrl === 'string').slice(0, 36);
  if (candidates.length < 3) {
    return reply(200, { status: 'unavailable', error: 'Not enough usable downloadable videos were found for this direction.', sources: found.sources || [], briefs, vimeoDiscovery: found.vimeoDiscovery || null });
  }
  const planning = {
    ...planningBase,
    treatment: brief.treatment,
    brief: {
      id: brief.id,
      label: brief.label,
      treatment: brief.treatment,
      alternates: briefs.map(item => ({ concept: item.concept, treatment: item.treatment, candidateIds: item.candidateIds, evidence: 'Song-aware visual brief.' })),
    },
    vimeoDiscovery: found.vimeoDiscovery || null,
  };
  const start = await send(SUBMIT, bridge, {
    action: 'analyze',
    payload: { profile, direction: brief.direction, candidates, sources: (found.sources || []).slice(0, 12), planning },
  });
  if (!start.ok) return reply(start.status === 429 ? 429 : 502, { error: 'Footage analysis unavailable.' });
  const next = await start.json();
  if (!isJob(next.jobId)) return reply(502, { error: 'Footage analysis unavailable.' });
  return reply(200, {
    status: 'pending',
    phase: 'vision',
    jobId: next.jobId,
    ticket: ticket(bridge, next.jobId, 'vision', profile),
    briefs,
    selectedBrief: { id: brief.id, label: brief.label, treatment: brief.treatment },
    vimeoDiscovery: found.vimeoDiscovery || null,
  });
}

async function processRequest(request){
 if(process.env.SITE_ID!==SITE || new URL(request.url).origin!==ORIGIN) return reply(404,{error:'Not available.'});
 if(request.method!=='POST') return reply(405,{error:'Use POST.'});
 if(request.headers.get('origin')!==ORIGIN) return reply(403,{error:'Open MUMOO Staging.'});
 if(!validAccess(request.headers.get('x-mumoo-brain-access')||'',process.env.MUMOO_BRAIN_TESTER_KEY)) return reply(401,{error:'Staging access is invalid or expired.'});
 const bridge=process.env.MUMOO_MUSIC_BRIDGE_SECRET||'', brain=process.env.MUMOO_BRAIN_SERVICE_SECRET||'';
 if(bridge.length<32 || brain.length<32) return reply(503,{error:'Vision research is unavailable.'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) return reply(415,{error:'Expected JSON.'});
 if(Number(request.headers.get('content-length'))>48000) return reply(413,{error:'Request too large.'});
 const bytes=await request.arrayBuffer(); if(bytes.byteLength>48000) return reply(413,{error:'Request too large.'});
 let body; try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'Invalid request.'});}
 if(!body || typeof body!=='object' || Array.isArray(body) || !validProfile(body.profile)) return reply(400,{error:'Invalid music profile.'});
 if(body.operation==='vision-start'){
  if(Object.keys(body).some(k=>!['operation','profile'].includes(k))) return reply(400,{error:'Invalid request.'});
  const r=await send(SUBMIT,bridge,{action:'direction',payload:{profile:body.profile}}); if(!r.ok)return reply(r.status===429?429:502,{error:'Visual planning unavailable.'});
  const data=await r.json(); if(!isJob(data.jobId)) return reply(502,{error:'Visual planning unavailable.'});
  return reply(200,{status:'pending',phase:'direction',jobId:data.jobId,ticket:ticket(bridge,data.jobId,'direction',body.profile)});
 }
 const allowedPhase=['direction','briefs','vision'];
 if(body.operation!=='vision-poll' || Object.keys(body).some(k=>!['operation','profile','phase','jobId','ticket','directionIndex','excludeIds'].includes(k)) || !allowedPhase.includes(body.phase) || !isJob(body.jobId) || typeof body.ticket!=='string' || !/^[a-f0-9]{64}$/.test(body.ticket)) return reply(400,{error:'Invalid request.'});
 if(body.directionIndex!==undefined && (!Number.isSafeInteger(body.directionIndex) || body.directionIndex<0 || body.directionIndex>2)) return reply(400,{error:'Invalid request.'});
 if(body.excludeIds!==undefined && (!Array.isArray(body.excludeIds) || body.excludeIds.length>24 || body.excludeIds.some(id=>typeof id!=='string' || !/^(?:pixabay|vimeo)-\d+$/.test(id)))) return reply(400,{error:'Invalid request.'});
 const ticketPhase = body.phase === 'briefs' ? 'direction' : body.phase;
 const expected=Buffer.from(ticket(bridge,body.jobId,ticketPhase,body.profile),'hex'), supplied=Buffer.from(body.ticket,'hex');
 if(expected.length!==supplied.length || !timingSafeEqual(expected,supplied)) return reply(403,{error:'Invalid staging job.'});

 if(body.phase==='briefs'){
  const poll=await send(STATUS,bridge,{jobId:body.jobId});
  if(poll.status===202) return reply(200,{status:'pending',phase:'direction',jobId:body.jobId,ticket:body.ticket});
  if(!poll.ok) return reply(502,{error:'Visual planning failed.'});
  const data=await poll.json();
  if(data.status!=='ready' || data.action!=='direction') return reply(502,{error:'Vision result unavailable.'});
  const briefs=normalizeBriefs(data.result);
  if(briefs.length<2) return reply(502,{error:'Visual planning failed.'});
  const index=body.directionIndex ?? 0;
  const brief=briefs[Math.min(index, briefs.length-1)];
  return startAnalyze(brain, bridge, body.profile, brief, briefs, body.excludeIds || [], {
    provenance: data.result.provenance,
    timings: data.result.timings,
    allBriefs: briefs.map(({ id, label, treatment, concept }) => ({ id, label, treatment, concept })),
  });
 }

 const poll=await send(STATUS,bridge,{jobId:body.jobId}); if(poll.status===202)return reply(200,{status:'pending',phase:body.phase,jobId:body.jobId,ticket:body.ticket});
 if(!poll.ok)return reply(502,{error:body.phase==='direction'?'Visual planning failed.':'Footage analysis failed.'});
 const data=await poll.json(); if(data.status!=='ready' || data.action!==(body.phase==='direction'?'direction':'analyze'))return reply(502,{error:'Vision result unavailable.'});
 if(body.phase==='vision') {
  const result=data.result || {};
  if (result.status === 'ready' && Array.isArray(result.planning?.allBriefs)) {
    result.creativeDirections = result.planning.allBriefs.map(item => ({
      concept: item.concept || item.label,
      treatment: item.treatment,
      candidateIds: [],
      evidence: 'Song-aware visual brief; observations remain uncertain.',
    }));
  }
  if (result.planning?.vimeoDiscovery && !result.vimeoDiscovery) result.vimeoDiscovery = result.planning.vimeoDiscovery;
  return reply(200,{status:'ready',result});
 }

 // Direction phase complete: return selectable briefs before starting expensive analyze.
 const briefs=normalizeBriefs(data.result);
 if(briefs.length<2) return reply(502,{error:'Visual planning failed.'});
 return reply(200,{
  status:'briefs',
  phase:'direction',
  jobId:body.jobId,
  ticket:body.ticket,
  briefs,
  provenance:data.result.provenance,
  timings:data.result.timings,
 });
}
export default async function handler(request){
 const started=Date.now(),requestId=randomUUID();let result;
 try{result=await processRequest(request);}catch{result=reply(503,{error:'Vision research is unavailable.'});}
 console.info(JSON.stringify({event:'vision_gateway',requestId,time:new Date(started).toISOString(),status:result.status,durationMs:Date.now()-started}));result.headers.set('X-Mumoo-Request-Id',requestId);return result;
}
