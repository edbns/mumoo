import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

test('Human Magnet visual path inspects footage and previews without requesting WhisperX', { timeout: 240000, skip: process.env.MUMOO_HUMAN_BROWSER !== '1' }, async t => {
  const sources = JSON.parse(process.env.MUMOO_HUMAN_SOURCES || '[]');
  assert.equal(sources.length, 3); assert.ok(process.env.MUMOO_REAL_SONG);
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: true, ...(process.env.MUMOO_HEADLESS_GPU === '1' ? { args: ['--use-angle=metal', '--enable-gpu'] } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); let syncCalls = 0, analysisCalls = 0, plans = 0, inspected = false;
    const lyric = process.env.MUMOO_HUMAN_LYRIC === '1';
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/align-lyrics', route => { syncCalls++; return lyric ? route.fulfill({json:{version:1,method:'whisperx_supplied_lyrics',words:[{text:'Vem',status:'aligned',startMs:1000,endMs:1500}]}}) : route.abort(); });
    await page.route('**/api/brain-recommendations', route => route.fulfill({json:{catalog:[{id:'daily-screens',renderer:{template:'daily-screens'}},{id:'lyric-impact',renderer:{template:'lyric-impact'}}]}}));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      analysisCalls++; const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1000, 5000, 10000], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 130, alternativesBpm: [] } }, features: { transientsMs: [1000, 5000, 10000], frames: [{ timeMs: 0, rms: .2, centroidHz: 1000, onsetStrength: .1 }, { timeMs: 1000, rms: .5, centroidHz: 1200, onsetStrength: .4 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/api/media-catalog', async route => {
      const request = route.request().postDataJSON();
      if (request.operation === 'research-asset') return route.fulfill({ status: 200, contentType: 'video/mp4', body: readFileSync(sources[Number(request.id.split('-')[1]) - 1]) });
      assert.equal(request.operation, 'human-plan'); plans++;
      if (process.env.MUMOO_HUMAN_RETRY === '1' && plans === 1) return route.fulfill({ status:503, json:{error:'Media service unavailable.'} });
      if (request.observations.length) { assert.equal(request.observations.length, 3); assert.ok(request.observations.every(item => item.samples.length >= 1)); inspected = true; }
      const assets = [1,2,3].map(n => ({ id:`pixabay-${n}`, query:'test footage', sourceUrl:'https://pixabay.com/videos/example/', creator:'Test', type:'video', title:`Person ${n}`, rights:'STAGING_TEST_ONLY', adSafety:'REVIEW_REQUIRED' }));
      const shots = assets.map((asset, i) => ({ assetId:asset.id, startFrame:i*150, endFrame:(i+1)*150, sourceInMs:0, sourceOutMs:5000, transition:{type:i && request.treatment === 'face' ? 'dissolve' : 'cut',durationFrames:i && request.treatment === 'face' ? 9 : 0}, crop:{mode:'cover',x:.5,y:.5} }));
      return route.fulfill({ json: { version:1,status:'ready',scope:'staging-test-only',durationMs:15000,assets,executionPlan:{version:2,clipSha256:request.profile.clipSha256,fps:30,durationFrames:450,seed:request.seed,lyrics:{source:lyric?'approved-local-cues':'none'},motion:[{startFrame:0,endFrame:450,intensity:.4}],shots} } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.getByLabel('Source WAV').setInputFiles(process.env.MUMOO_REAL_SONG);
    await page.getByLabel('Primary genre').fill('House'); await page.getByText('Staging access enabled.').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name:'Continue to clip' }).click(); await page.getByLabel('Clip start (ms)').fill('41000');
    await page.getByRole('button', { name:'Continue to video type' }).click(); await page.getByLabel(lyric?'Lyric Video':'Visual').check(); await page.getByRole('button', { name:'Continue', exact:true }).click();
    if (lyric) { await page.getByText('Paste lyrics for this section').click(); await page.getByLabel('Lyrics for this section').fill('Vem'); await page.getByRole('button',{name:'Sync lyrics'}).click(); await page.getByText('Synced 1 words.',{exact:false}).waitFor(); await page.getByRole('button',{name:'Approve lyrics and choose visual'}).click(); await page.getByRole('button',{name:'Human Magnet'}).click(); }
    else await page.getByRole('button', { name:'Human Magnet' }).click();
    await page.getByRole('heading', { name:'Human Magnet' }).waitFor();
    if (process.env.MUMOO_HUMAN_RETRY === '1') await page.getByRole('button', { name:'Try again' }).click();
    await page.getByRole('button', { name:'Play', exact:true }).waitFor({ state:'visible', timeout:60000 });
    await page.waitForFunction(() => !document.querySelector('button[disabled]') || ![...document.querySelectorAll('button')].find(x => x.textContent === 'Play')?.disabled, { timeout: 60000 });
    assert.equal(syncCalls, lyric ? 1 : 0); assert.equal(analysisCalls, 1); assert.equal(plans, process.env.MUMOO_HUMAN_RETRY === '1' ? 3 : 2); assert.ok(inspected);
    const canvas = page.getByLabel('Automatic video preview');
    if (process.env.MUMOO_HUMAN_SAMPLE) writeFileSync(process.env.MUMOO_HUMAN_SAMPLE, await canvas.screenshot());
    if (process.env.MUMOO_HUMAN_EXPORT === '1') {
      await page.locator('.preview-mark').evaluate(el => { el.style.display = 'none'; });
      await canvas.evaluate(el => { el.style.borderRadius = '0'; });
      const preview = await canvas.screenshot();
      const start = performance.now(), pending = page.waitForEvent('download', { timeout: 150000 });
      await page.getByRole('button', { name:'Download MP4' }).click(); const download = await pending, file = await download.path();
      if (process.env.MUMOO_HUMAN_OUTPUT) copyFileSync(file, process.env.MUMOO_HUMAN_OUTPUT);
      const info = JSON.parse(execFileSync(ffprobe.path, ['-v','error','-show_streams','-show_format','-of','json',file]));
      const v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
      assert.deepEqual([v.codec_name,v.width,v.height,v.r_frame_rate,v.nb_frames,a.codec_name,info.format.duration],['h264',1080,1920,'30/1','450','aac','15.000000']);
      const expected = execFileSync(ffmpeg.path,['-v','error','-i','pipe:0','-vf','scale=54:96','-pix_fmt','rgb24','-f','rawvideo','-'],{input:preview});
      const actual = execFileSync(ffmpeg.path,['-v','error','-i',file,'-vf',"select='eq(n,0)',scale=54:96",'-vsync','0','-pix_fmt','rgb24','-f','rawvideo','-']);
      assert.equal(actual.length,expected.length); const error = actual.reduce((sum,value,i)=>sum+Math.abs(value-expected[i]),0)/actual.length; assert.ok(error < 15, `preview/export RGB error ${error}`);
      const source = execFileSync(ffmpeg.path,['-v','error','-ss','41','-i',process.env.MUMOO_REAL_SONG,'-t','15','-ac','1','-ar','16000','-f','f32le','-']);
      const output = execFileSync(ffmpeg.path,['-v','error','-i',file,'-t','15','-ac','1','-ar','16000','-f','f32le','-']);
      const count=Math.min(source.length,output.length)/4; let dot=0, aa=0, bb=0;
      for(let i=0;i<count;i++){const x=source.readFloatLE(i*4),y=output.readFloatLE(i*4);dot+=x*y;aa+=x*x;bb+=y*y;}
      const correlation=dot/Math.sqrt(aa*bb); assert.ok(correlation > .9, `selected audio correlation ${correlation}`);
      t.diagnostic(`Real-song export ${(performance.now()-start)/1000}s; frame 0 preview/export error ${error.toFixed(2)}/255; source-audio correlation ${correlation.toFixed(4)}. Services mocked.`);
    }
    await page.getByRole('button', { name:'Play', exact:true }).click(); await page.getByRole('button', { name:'Pause', exact:true }).waitFor();
    t.diagnostic(`Real song and user-authorized footage; tester access, music analysis, Brain and ${lyric ? 'lyric alignment were mocked' : 'no WhisperX request was made'}. Preview used PixiJS.`);
  } finally { await browser.close(); await server.close(); }
});
