import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const clip = { sourceSha256:'a'.repeat(64), offsetMs:1000, durationMs:15000 };
const composition = { version:2, template:'scribble', sourceSha256:clip.sourceSha256, clipStartMs:clip.offsetMs, cues:[] };
const assets = [1,2].map(n=>({id:`pixabay-${n}`, type:'video', title:`Footage ${n}`, rights:'STAGING_TEST_ONLY', adSafety:'REVIEW_REQUIRED'}));
const loaded = new Map(assets.map(a=>[a.id,`blob:${a.id}`]));
const plan = () => ({version:1,status:'ready',scope:'staging-test-only',durationMs:15000,assets,executionPlan:{version:2,clipSha256:'b'.repeat(64),fps:30,durationFrames:450,seed:12,lyrics:{source:'none'},motion:[{startFrame:0,endFrame:450,intensity:.5}],shots:[
  {assetId:'pixabay-1',startFrame:0,endFrame:225,sourceInMs:1000,sourceOutMs:8500,transition:{type:'cut',durationFrames:0},crop:{mode:'cover',x:.5,y:.5}},
  {assetId:'pixabay-2',startFrame:225,endFrame:450,sourceInMs:2000,sourceOutMs:9500,transition:{type:'dissolve',durationFrames:9},crop:{mode:'cover',x:.5,y:.5}},
]}});

test('director contract enforces exact frame boundaries, source ranges, transitions and clip identity', async () => {
  const server=await createServer({server:{middlewareMode:true,hmr:false},logLevel:'error'});
  try {
    const {directorExecutionEdit,directorFrame}=await server.ssrLoadModule('/src/director-plan.ts');
    const edit=directorExecutionEdit(clip,plan(),loaded,composition,'b'.repeat(64));
    assert.equal(directorFrame(edit,224).shot.assetId,'pixabay-1');
    assert.equal(directorFrame(edit,225).shot.assetId,'pixabay-2');
    assert.equal(directorFrame(edit,225).sourceMs,2000);
    assert.equal(directorFrame(edit,225).mix,0);
    assert.equal(directorFrame(edit,229).mix,4/9);
    assert.equal(directorFrame(edit,234).mix,1);
    assert.deepEqual(directorFrame(edit,100),directorFrame(edit,100));
    assert.throws(()=>directorExecutionEdit({...clip,offsetMs:2000},plan(),loaded,composition,'b'.repeat(64)));
    assert.throws(()=>directorExecutionEdit(clip,plan(),loaded,composition,'c'.repeat(64)));
    for(const mutate of [p=>p.executionPlan.shots[1].startFrame++, p=>p.executionPlan.shots[1].sourceOutMs=2001,
      p=>p.executionPlan.shots[1].transition.type='wipe',p=>p.executionPlan.motion[0].intensity=1.01,
      p=>p.executionPlan.shots[0].unsupported='silently ignored',p=>p.executionPlan.fps=24]) {
      const bad=plan(); mutate(bad); assert.throws(()=>directorExecutionEdit(clip,bad,loaded,composition,'b'.repeat(64)));
    }
    const strong=plan(); strong.executionPlan.motion[0].intensity=1;
    const restrained=plan(); restrained.executionPlan.motion[0].intensity=0;
    assert.ok(directorFrame(directorExecutionEdit(clip,strong,loaded,composition,'b'.repeat(64)),150).scale > directorFrame(directorExecutionEdit(clip,restrained,loaded,composition,'b'.repeat(64)),150).scale);
  } finally { await server.close(); }
});

test('two director plans render approved footage and export real MP4 with matching preview frames', { timeout: 300000, skip: !process.env.MUMOO_DIRECTOR_FOOTAGE_FIXTURE || !process.env.MUMOO_DIRECTOR_AUDIO_FIXTURE }, async t => {
  const { chromium } = await import('playwright');
  const { realpathSync, readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { default: ffmpeg } = await import('@ffmpeg-installer/ffmpeg');
  const { default: ffprobe } = await import('@ffprobe-installer/ffprobe');
  const server = await createServer({server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),realpathSync('node_modules')]}},logLevel:'error'});
  await server.listen();
  const browser = await chromium.launch({headless:false,executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'});
  try {
    const page=await browser.newPage({acceptDownloads:true});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    await page.evaluate(()=>{for(const id of ['footage','audio']){const input=document.createElement('input');input.type='file';input.id=id;document.body.append(input);}});
    await page.locator('#footage').setInputFiles(process.env.MUMOO_DIRECTOR_FOOTAGE_FIXTURE);
    await page.locator('#audio').setInputFiles(process.env.MUMOO_DIRECTOR_AUDIO_FIXTURE);
    const base=plan(); const second=plan();
    if (process.env.MUMOO_DIRECTOR_TIMELINE_FIXTURE) {
      const source=JSON.parse(readFileSync(process.env.MUMOO_DIRECTOR_TIMELINE_FIXTURE,'utf8'));
      const segments=source.directorBlueprint.musicDirection.segments;
      base.executionPlan.motion=segments.map(s=>({startFrame:Math.round(s.startMs*30/1000),endFrame:Math.round(s.endMs*30/1000),intensity:s.motionIntensity}));
    }
    second.executionPlan.motion=base.executionPlan.motion.map(s=>({...s,intensity:1}));
    second.executionPlan.shots[0].endFrame=180; second.executionPlan.shots[0].sourceInMs=2000; second.executionPlan.shots[0].sourceOutMs=8000;
    second.executionPlan.shots[1].startFrame=180; second.executionPlan.shots[1].sourceInMs=1000; second.executionPlan.shots[1].sourceOutMs=10000;
    second.executionPlan.shots[1].transition={type:'cut',durationFrames:0};
    const payload={base,second,clip:{...clip,offsetMs:0},composition:{...composition,clipStartMs:0,cues:[{text:'TEST',startMs:2000,endMs:3000}]}};
    for(const p of [payload.base,payload.second]) p.executionPlan.lyrics.source='approved-local-cues';
    const previews=await page.evaluate(async input=>{
      const {directorExecutionEdit}=await import('/src/director-plan.ts'); const {createPixiDirectorRenderer}=await import('/src/pixi-director.ts');
      const file=document.querySelector('#footage').files[0], urls=[URL.createObjectURL(file),URL.createObjectURL(file)];
      const loaded=new Map([['pixabay-1',urls[0]],['pixabay-2',urls[1]]]);
      const result=[];
      const motionOnly=structuredClone(input.base); motionOnly.executionPlan.motion=motionOnly.executionPlan.motion.map(s=>({...s,intensity:1}));
      const sourceOnly=structuredClone(input.base); sourceOnly.executionPlan.shots[0].sourceInMs+=1000; sourceOnly.executionPlan.shots[0].sourceOutMs+=1000;
      const noLyrics=structuredClone(input.base); noLyrics.executionPlan.lyrics.source='none';
      for(const [plan,comp] of [[input.base,input.composition],[input.second,input.composition],[input.base,input.composition],[motionOnly,input.composition],[sourceOnly,input.composition],[noLyrics,{...input.composition,cues:[]}]]) {
        const edit=directorExecutionEdit(input.clip,plan,loaded,comp,'b'.repeat(64)), canvas=document.createElement('canvas');
        const scene=await createPixiDirectorRenderer(canvas,edit,comp), start=performance.now(), images=[];
        try {for(const frame of [0,60,150,179,180,224,225,229,234,300]) {await scene.render(frame);images.push(canvas.toDataURL());} result.push({images,elapsed:performance.now()-start});} finally {scene.destroy();}
      }
      urls.forEach(URL.revokeObjectURL); return result;
    },payload);
    assert.deepEqual(previews[0].images,previews[2].images,'same plan and seed must repeat exactly');
    assert.notEqual(previews[0].images[4],previews[1].images[4],'different cut and source range must change the actual rendered frame');
    const pixels = png => execFileSync(ffmpeg.path,['-v','error','-i','pipe:0','-vf','scale=108:192','-pix_fmt','rgb24','-f','rawvideo','-'],{input:Buffer.from(png.split(',')[1],'base64')});
    const subdued=pixels(previews[0].images[2]), strong=pixels(previews[3].images[2]);
    const motionDifference=strong.reduce((sum,value,index)=>sum+Math.abs(value-subdued[index]),0)/strong.length;
    assert.ok(motionDifference>.1,`motion intensity must visibly affect pixels: ${motionDifference}`);
    t.diagnostic(`motion-only mean RGB difference: ${motionDifference.toFixed(2)}/255`);
    assert.notEqual(previews[0].images[0],previews[4].images[0],'source offset alone must change the rendered first frame');
    assert.notEqual(previews[0].images[1],previews[5].images[1],'approved lyric cue must change the frame at its start');
    assert.equal(previews[0].images[2],previews[5].images[2],'lyric should no longer appear after the cue');
    for(const [i,p] of [payload.base,payload.second].entries()) {
      const waiting=page.waitForEvent('download',{timeout:260000}), start=performance.now();
      await page.evaluate(async input=>{
        const {directorExecutionEdit}=await import('/src/director-plan.ts');const {createPixiDirectorRenderer}=await import('/src/pixi-director.ts');const {renderMp4}=await import('/src/browser-export.ts');
        const file=document.querySelector('#footage').files[0], urls=[URL.createObjectURL(file),URL.createObjectURL(file)];
        const edit=directorExecutionEdit(input.clip,input.p,new Map([['pixabay-1',urls[0]],['pixabay-2',urls[1]]]),input.composition,'b'.repeat(64));
        const audioFile=document.querySelector('#audio').files[0], context=new AudioContext(), audio=await context.decodeAudioData(await audioFile.arrayBuffer()); await context.close();
        let renderer; try {
          const output=await renderMp4(input.composition,audio,()=>{},async(canvas,frame)=>{renderer??=await createPixiDirectorRenderer(canvas,edit,input.composition);await renderer.render(frame);});
          const link=document.createElement('a');link.href=URL.createObjectURL(output);link.download='director-test.mp4';link.click();
        } finally {renderer?.destroy();urls.forEach(URL.revokeObjectURL);}
      },{p,clip:payload.clip,composition:payload.composition});
      const file=await (await waiting).path(), seconds=(performance.now()-start)/1000;
      const info=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',file]));
      const video=info.streams.find(s=>s.codec_type==='video'), audio=info.streams.find(s=>s.codec_type==='audio');
      assert.deepEqual([video.codec_name,video.width,video.height,video.nb_frames,video.r_frame_rate,audio.codec_name,info.format.duration],['h264',1080,1920,'450','30/1','aac','15.000000']);
      const frames=[0,60,150,179,180,224,225,229,234,300];
      const expected=Buffer.concat(previews[i].images.map(png=>execFileSync(ffmpeg.path,['-v','error','-i','pipe:0','-vf','scale=54:96','-pix_fmt','rgb24','-f','rawvideo','-'],{input:Buffer.from(png.split(',')[1],'base64')})));
      const filter=`select='${frames.map(n=>`eq(n,${n})`).join('+')}',scale=54:96`;
      const actual=execFileSync(ffmpeg.path,['-v','error','-i',file,'-vf',filter,'-vsync','0','-pix_fmt','rgb24','-f','rawvideo','-']);
      const decodedArgs=['-v','error','-i'];
      const sourceAudio=execFileSync(ffmpeg.path,[...decodedArgs,process.env.MUMOO_DIRECTOR_AUDIO_FIXTURE,'-t','15','-ac','1','-ar','16000','-f','f32le','-']);
      const exportedAudio=execFileSync(ffmpeg.path,[...decodedArgs,file,'-t','15','-ac','1','-ar','16000','-f','f32le','-']);
      const samples=Math.min(sourceAudio.length,exportedAudio.length)/4; let dot=0,a2=0,b2=0;
      for(let j=0;j<samples;j++){const a=sourceAudio.readFloatLE(j*4),b=exportedAudio.readFloatLE(j*4);dot+=a*b;a2+=a*a;b2+=b*b;}
      const correlation=dot/Math.sqrt(a2*b2); assert.ok(correlation>.9,`selected source audio correlation ${correlation}`);
      t.diagnostic(`plan ${i+1}: source audio correlation ${correlation.toFixed(4)}`);
      assert.equal(actual.length,expected.length);const error=actual.reduce((sum,value,j)=>sum+Math.abs(value-expected[j]),0)/actual.length;
      assert.ok(error<15,`preview/export RGB error ${error}`);
      t.diagnostic(`plan ${i+1}: ${seconds.toFixed(2)} s export; sampled preview/export mean RGB error ${error.toFixed(2)}/255`);
    }
  } finally {await browser.close();await server.close();}
});
