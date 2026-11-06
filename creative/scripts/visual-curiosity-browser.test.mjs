import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

test('Visual Curiosity opens in the real Visual flow, previews distinct styles and downloads the selected music', { timeout:180000, skip:process.env.MUMOO_CURIOSITY_BROWSER !== '1' }, async t=>{
  assert.ok(process.env.MUMOO_REAL_SONG);
  const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:960}});let lyricCalls=0,mediaCalls=0,analysisCalls=0;const lyric=process.env.MUMOO_CURIOSITY_LYRIC==='1';
    await page.route('**/api/brain-tester-access',route=>route.fulfill({json:{token:'test-token'}}));
    await page.route('**/.netlify/functions/align-lyrics',route=>{lyricCalls++;return lyric?route.fulfill({json:{version:1,method:'whisperx_supplied_lyrics',words:[{text:'Vem',status:'aligned',startMs:2000,endMs:2500}]}}):route.abort();});
    await page.route('**/api/brain-recommendations',route=>route.fulfill({json:{catalog:[{id:'daily-screens',renderer:{template:'daily-screens'}},{id:'lyric-impact',renderer:{template:'lyric-impact'}}]}}));
    await page.route('**/api/media-catalog',route=>{mediaCalls++;return route.fulfill({json:{status:'unavailable'}});});
    await page.route('**/.netlify/functions/analyze-music',async route=>{analysisCalls++;if(process.env.MUMOO_CURIOSITY_ANALYSIS_FAIL==='1')return route.fulfill({status:503,json:{error:'Unavailable'}});const hash=createHash('sha256').update(route.request().postDataBuffer()).digest('hex');await route.fulfill({json:{version:1,method:'beat_this_librosa',clip:{durationMs:15000,offsetMs:0,sha256:hash},rhythm:{beatsMs:[1000,2000,3000],downbeatsMs:[],tempo:{status:'estimated',gridBpm:130,alternativesBpm:[]}},features:{transientsMs:[1000,2000],frames:[{timeMs:0,rms:.2,centroidHz:1000,onsetStrength:.1},{timeMs:1000,rms:.5,centroidHz:1200,onsetStrength:.4}]},provenance:{},metrics:{}}});});
    await page.goto(process.env.MUMOO_CURIOSITY_STAGING_URL || `http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.getByLabel('Source WAV').setInputFiles(process.env.MUMOO_REAL_SONG);await page.getByLabel('Primary genre').fill('House');
    await page.getByLabel('Staging tester password').fill('test password');await page.getByRole('button',{name:'Unlock staging'}).click();
    await page.getByRole('button',{name:'Continue to clip'}).click();await page.getByLabel('Clip start (ms)').fill('41000');
    await page.getByRole('button',{name:'Continue to video type'}).click();await page.getByLabel(lyric?'Lyric Video':'Visual').check();await page.getByRole('button',{name:'Continue',exact:true}).click();
    if(lyric){await page.getByText('Paste lyrics for this section').click();await page.getByLabel('Lyrics for this section').fill('Vem');await page.getByRole('button',{name:'Sync lyrics'}).click();await page.getByText('Synced 1 words.',{exact:false}).waitFor();await page.getByRole('button',{name:'Approve lyrics and choose visual'}).click();if(process.env.MUMOO_CURIOSITY_VIA_HUMAN==='1'){await page.getByRole('button',{name:'Human Magnet'}).click();await page.getByRole('heading',{name:'Human Magnet'}).waitFor();}await page.getByRole('button',{name:'Visual Curiosity'}).click();mediaCalls=0;}
    await page.getByRole('heading',{name:'Visual Curiosity'}).waitFor();const canvas=page.getByLabel('Visual Curiosity preview');
    await page.getByRole('button',{name:'Download MP4'}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(el=>el.textContent==='Download MP4')?.disabled);
    if(process.env.MUMOO_CURIOSITY_ANALYSIS_FAIL==='1'){await page.getByText('Music analysis is unavailable; this style will use its ambient motion.').waitFor();await page.getByRole('button',{name:'Play',exact:true}).click();assert.equal(lyricCalls,lyric?1:0);assert.equal(mediaCalls,0);return;}
    const images=[];
    for(const style of ['Liquid Light','Glass Shift','Soft Fold']){await page.getByRole('button',{name:style}).click();const image=await canvas.evaluate(el=>el.toDataURL('image/png'));images.push(image);if(process.env.MUMOO_CURIOSITY_SAMPLES)writeFileSync(`${process.env.MUMOO_CURIOSITY_SAMPLES}-${style.replaceAll(' ','-')}.png`,Buffer.from(image.split(',')[1],'base64'));}
    assert.equal(new Set(images).size,3);if(process.env.MUMOO_CURIOSITY_SAMPLE_ONLY==='1')return;await page.getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByLabel('Seek preview').fill('2000');
    const preview=await canvas.evaluate(el=>el.toDataURL('image/png'));const start=performance.now();const pending=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'Download MP4'}).click();const download=await pending,file=await download.path();
    const info=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',file]));const v=info.streams.find(s=>s.codec_type==='video'),a=info.streams.find(s=>s.codec_type==='audio');
    assert.deepEqual([v.codec_name,v.width,v.height,v.nb_frames,v.r_frame_rate,a.codec_name,info.format.duration],['h264',1080,1920,'450','30/1','aac','15.000000']);
    const expected=execFileSync(ffmpeg.path,['-v','error','-i','pipe:0','-vf','scale=54:96','-pix_fmt','rgb24','-f','rawvideo','-'],{input:Buffer.from(preview.split(',')[1],'base64')});
    const actual=execFileSync(ffmpeg.path,['-v','error','-i',file,'-vf',"select='eq(n,60)',scale=54:96",'-vsync','0','-pix_fmt','rgb24','-f','rawvideo','-']);assert.equal(actual.length,expected.length);
    const diff=actual.reduce((sum,x,i)=>sum+Math.abs(x-expected[i]),0)/actual.length;assert.ok(diff<15,`preview/export RGB error ${diff}`);
    const input=execFileSync(ffmpeg.path,['-v','error','-ss','41','-i',process.env.MUMOO_REAL_SONG,'-t','15','-ac','1','-ar','16000','-f','f32le','-']);
    const output=execFileSync(ffmpeg.path,['-v','error','-i',file,'-t','15','-ac','1','-ar','16000','-f','f32le','-']);let dot=0,aa=0,bb=0;
    for(let i=0;i<Math.min(input.length,output.length);i+=4){const x=input.readFloatLE(i),y=output.readFloatLE(i);dot+=x*y;aa+=x*x;bb+=y*y;}const correlation=dot/Math.sqrt(aa*bb);assert.ok(correlation>.9,`audio correlation ${correlation}`);
    assert.equal(lyricCalls,lyric?1:0);assert.equal(mediaCalls,0);assert.equal(analysisCalls,1);
    await page.getByRole('button',{name:lyric?'Lyric formats':'Human Magnet'}).click();await page.getByRole('heading',{name:lyric?'Daily Screens':'Human Magnet'}).waitFor();
    t.diagnostic(`Real song; analysis, access ${lyric?'and lyric alignment mocked':'mocked; no WhisperX requests'}. Three visually different styles, no media requests; export ${((performance.now()-start)/1000).toFixed(2)}s, frame error ${diff.toFixed(2)}/255, selected-audio correlation ${correlation.toFixed(4)}.`);
  } finally {await browser.close();await server.close();}
});
