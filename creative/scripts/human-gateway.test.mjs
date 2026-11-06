import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler, { config } from '../netlify/functions/media-gateway.mjs';
const key='k'.repeat(48), secret='s'.repeat(48), expiry=Math.floor(Date.now()/1000)+600;
const token=`${expiry}.${createHmac('sha256',key).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
const profile={version:1,durationMs:15000,clipSha256:'a'.repeat(64),videoType:'visual',lyricCues:[],creator:{primaryGenre:'House',influence:null},measured:{tempo:{status:'unavailable'},beatsMs:[],onsetsMs:[],envelope:[]}};
const req=(body,access=token)=>new Request('https://mumoo-staging.netlify.app/api/media-catalog',{method:'POST',headers:{origin:'https://mumoo-staging.netlify.app','content-type':'application/json','x-mumoo-brain-access':access},body:JSON.stringify(body)});
test('Human Magnet gateway enforces access and forwards only bounded, non-private observations',async()=>{
 assert.deepEqual(config.rateLimit,{windowSize:60,windowLimit:25,aggregateBy:['ip']});
 process.env.SITE_ID='097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';process.env.MUMOO_BRAIN_TESTER_KEY=key;process.env.MUMOO_BRAIN_SERVICE_SECRET=secret;
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url,opts)=>{calls++;const forwarded=JSON.parse(opts.body);assert.equal(forwarded.operation,'human-plan');assert.equal(JSON.stringify(forwarded).includes('sensitive content'),false);return Response.json({status:'ready',assets:[]});};
 try {const body={operation:'human-plan',profile,seed:3,treatment:'face',observations:[{id:'pixabay-1',samples:[{offsetMs:3000,motion:.4,faceX:.7,faceY:.3}]}]};
 assert.equal((await handler(req(body,'invalid'))).status,401);
 assert.equal((await handler(req({...body,treatment:'toString'}))).status,400);
 assert.equal((await handler(req({...body,observations:[{...body.observations[0],private:'sensitive content'}]}))).status,400);
 assert.equal((await handler(req({...body,profile:{...profile,lyricCues:[{text:'sensitive content'}]}}))).status,400);
 const response=await handler(req({...body,profile:{...profile,unwanted:'sensitive content'}}));assert.equal(response.status,200);assert.equal(calls,1);assert.equal((await response.text()).includes(secret),false);
 } finally {globalThis.fetch=original;}
});
