import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../netlify/functions/media-gateway.mjs';
const key='k'.repeat(48), bridge='m'.repeat(48), brain='s'.repeat(48), expiry=Math.floor(Date.now()/1000)+600;
const access=`${expiry}.${createHmac('sha256',key).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
const profile={version:1,durationMs:15000,clipSha256:'a'.repeat(64),videoType:'visual',lyricCues:[]};
const sampleDirection={version:1,interpretation:'Busy street.',subjects:['crowds'],environments:['city'],aesthetic:['gritty'],movement:['fast'],camera:['handheld'],avoid:['logos']};
function req(body,token=access){return new Request('https://mumoo-staging.netlify.app/api/media-catalog',{method:'POST',headers:{origin:'https://mumoo-staging.netlify.app','content-type':'application/json','x-mumoo-brain-access':token},body:JSON.stringify(body)});}
test('vision gateway authenticates and binds job tickets to the exact profile',async()=>{
 process.env.SITE_ID='097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';process.env.MUMOO_BRAIN_TESTER_KEY=key;process.env.MUMOO_BRAIN_SERVICE_SECRET=brain;process.env.MUMOO_MUSIC_BRIDGE_SECRET=bridge;
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;const input=JSON.parse(opts.body);assert.equal(opts.headers.authorization,`Bearer ${bridge}`);assert.equal(input.action,'direction');return Response.json({jobId:'fc-abc123'});};
 try{
  assert.equal((await handler(req({operation:'vision-start',profile},'invalid'))).status,401);assert.equal(calls,0);
  assert.equal((await handler(req({operation:'vision-start',profile:{...profile,lyricCues:[{text:'private',startMs:0,endMs:1000}]}}))).status,400);
  const response=await handler(req({operation:'vision-start',profile}));assert.equal(response.status,200);const started=await response.json();assert.equal(started.phase,'direction');assert.ok(started.ticket);assert.equal(JSON.stringify(started).includes(bridge),false);
  const forged=await handler(req({operation:'vision-poll',profile:{...profile,clipSha256:'b'.repeat(64)},phase:started.phase,jobId:started.jobId,ticket:started.ticket}));assert.equal(forged.status,403);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('vision gateway returns briefs then starts analyze for a selected direction',async()=>{
 process.env.SITE_ID='097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';process.env.MUMOO_BRAIN_TESTER_KEY=key;process.env.MUMOO_BRAIN_SERVICE_SECRET=brain;process.env.MUMOO_MUSIC_BRIDGE_SECRET=bridge;
 const original=globalThis.fetch;const calls=[];
 const candidates=[1,2,3].map(n=>({id:`pixabay-${n}`,durationMs:10000,renderUrl:`https://cdn.pixabay.com/video/${n}.mp4`}));
 const directionResult={
  direction:sampleDirection,
  directions:[
   {id:'a',label:'Street',treatment:'kinetic',concept:'Street',direction:sampleDirection},
   {id:'b',label:'Interior',treatment:'restrained',concept:'Interior',direction:{...sampleDirection,subjects:['hands'],environments:['apartment'],interpretation:'Quiet room.'}},
  ],
  provenance:{type:'model'},timings:{},
 };
 globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url:String(url),body});
  if(String(url).includes('visual-intelligence-staging-submit'))return Response.json({jobId:body.action==='direction'?'fc-first':'fc-second'});
  if(String(url).includes('visual-intelligence-staging-status'))return Response.json({status:'ready',action:'direction',result:directionResult});
  if(String(url).includes('mumoo-brain-staging')){assert.equal(opts.headers.authorization,`Bearer ${brain}`);assert.equal(body.operation,'vision-search');return Response.json({sources:[{provider:'Pixabay',query:'city',count:3}],candidates,vimeoDiscovery:{status:'discovery-metadata-only',renderable:[]}});}
  throw new Error('unexpected destination');};
 try{
  const started=await (await handler(req({operation:'vision-start',profile}))).json();
  const briefsResponse=await handler(req({operation:'vision-poll',profile,phase:started.phase,jobId:started.jobId,ticket:started.ticket}));assert.equal(briefsResponse.status,200);
  const briefs=await briefsResponse.json();assert.equal(briefs.status,'briefs');assert.equal(briefs.briefs.length,2);
  const analyze=await handler(req({operation:'vision-poll',profile,phase:'briefs',jobId:started.jobId,ticket:started.ticket,directionIndex:1}));assert.equal(analyze.status,200);
  const next=await analyze.json();assert.equal(next.phase,'vision');assert.equal(next.jobId,'fc-second');assert.equal(next.selectedBrief.treatment,'restrained');assert.equal(JSON.stringify(next).includes('cdn.pixabay.com'),false);
  const analyzeCall=calls.find(c=>c.body?.action==='analyze');assert.ok(analyzeCall);assert.equal(analyzeCall.body.payload.planning.treatment,'restrained');assert.equal(analyzeCall.body.payload.candidates.length,3);
 }finally{globalThis.fetch=original;}
});
