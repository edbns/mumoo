import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../netlify/functions/media-gateway.mjs';
const key='k'.repeat(48), secret='s'.repeat(48), expiry=Math.floor(Date.now()/1000)+600;
const token=`${expiry}.${createHmac('sha256',key).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
const profile={version:1,durationMs:15000,clipSha256:'a'.repeat(64),videoType:'visual',lyricCues:[],creator:{primaryGenre:'House',influence:null},measured:{tempo:{status:'unavailable'},beatsMs:[],onsetsMs:[],envelope:[]}};
const req=(body,access=token)=>new Request('https://mumoo-staging.netlify.app/api/media-catalog',{method:'POST',headers:{origin:'https://mumoo-staging.netlify.app','content-type':'application/json','x-mumoo-brain-access':access},body:JSON.stringify(body)});
test('fast gateway rejects unauthorized and visual lyric input and forwards authorized bounded request',async()=>{
 process.env.SITE_ID='097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';process.env.MUMOO_BRAIN_TESTER_KEY=key;process.env.MUMOO_BRAIN_SERVICE_SECRET=secret;
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url,opts)=>{calls++;assert.equal(opts.headers.authorization,`Bearer ${secret}`);const forwarded=JSON.parse(opts.body);assert.equal(forwarded.operation,'fast-plan');assert.equal(JSON.stringify(forwarded).includes('sensitive content'),false);return Response.json({status:'ready',assets:[]});};
 try { const body={operation:'fast-plan',profile,seed:3,previousIds:[]};assert.equal((await handler(req(body,'invalid'))).status,401);assert.equal((await handler(req({...body,profile:{...profile,lyricCues:[{text:'x'}]}}))).status,400);const response=await handler(req({...body,profile:{...profile,unwanted:'sensitive content',measured:{...profile.measured,privateLyrics:'sensitive content'}}}));assert.equal(response.status,200);assert.equal(calls,1);assert.equal((await response.text()).includes(secret),false); } finally {globalThis.fetch=original;}
});
