import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('montage styles make distinct, frame-exact, bounded edits driven by music and observed motion', async () => {
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try {
    const { montageEdit, localMontageBase }=await server.ssrLoadModule('/src/rhythmic-montage.ts');
    const { directorFrame }=await server.ssrLoadModule('/src/director-plan.ts');
    const { frameState }=await server.ssrLoadModule('/src/media-timeline.ts');
    const clip={sourceSha256:'a'.repeat(64),offsetMs:1000,durationMs:15000};
    const assets=[1,2,3].map(n=>({id:`pixabay-${n}`,type:'video',url:`blob:${n}`,title:`Clip ${n}`}));
    const base={version:2,clip,fps:30,durationFrames:450,seed:9,lyrics:{source:'none'},motion:[{startFrame:0,endFrame:450,intensity:.4}],assets,
      shots:assets.map((a,i)=>({assetId:a.id,startFrame:i*150,endFrame:(i+1)*150,sourceInMs:1000,sourceOutMs:6000,transition:{type:'cut',durationFrames:0},crop:{mode:'cover',x:.5,y:.5}}))};
    const analysis={status:'ready',clip,result:{rhythm:{beatsMs:[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000,11000,12000,13000,14000]},features:{transientsMs:[1500,4500,7500,10500,13500]}}};
    const movement={'pixabay-1':.01,'pixabay-2':.8,'pixabay-3':.3};
    const pulse=montageEdit(base,analysis,'pulse',movement),contrast=montageEdit(base,analysis,'contrast',movement),flow=montageEdit(base,analysis,'flow',movement);
    assert.deepEqual(pulse,montageEdit(base,analysis,'pulse',movement));
    assert.notDeepEqual(pulse.shots.map(s=>s.startFrame),contrast.shots.map(s=>s.startFrame));
    assert.notDeepEqual(contrast.shots.map(s=>s.startFrame),flow.shots.map(s=>s.startFrame));
    // Pulse densifies the director plan in place — opening stays on the planned opening asset.
    assert.equal(pulse.shots[0].assetId,'pixabay-1');
    assert.ok(pulse.shots.filter(s=>s.assetId==='pixabay-1').length>=2);
    for(const edit of [pulse,contrast,flow]){assert.equal(edit.shots[0].startFrame,0);assert.equal(edit.shots.at(-1).endFrame,450);for(let i=0;i<edit.shots.length;i++){const s=edit.shots[i];assert.equal(directorFrame(edit,s.startFrame).shot.assetId,s.assetId);assert.ok(s.sourceInMs>=1000&&s.sourceOutMs<=6000);if(i)assert.equal(edit.shots[i-1].endFrame,s.startFrame);}}
    const fallback=montageEdit(base,{status:'unavailable',reason:'not_requested'},'pulse',{});assert.equal(fallback.shots.at(-1).endFrame,450);
    const local={version:1,clip,durationMs:15000,assets,shots:assets.map((a,i)=>({assetId:a.id,startMs:i*5000,endMs:(i+1)*5000,transition:'cut'}))};
    const localEdit=montageEdit(local,analysis,'contrast',movement);
    for(const shot of localEdit.shots)assert.equal(frameState(localEdit,shot.startFrame).shot,shot);
    assert.ok(localEdit.shots.some(shot=>shot.transition==='dissolve'));
    const offsets={...local,shots:local.shots.map((shot,i)=>({...shot,sourceStartMs:(i+1)*700}))};
    const offsetEdit=montageEdit(offsets,analysis,'flow',movement);for(const shot of offsetEdit.shots)assert.equal(shot.sourceStartMs,offsets.shots.find(source=>source.assetId===shot.assetId).sourceStartMs);
    const all=Array.from({length:8},(_,i)=>({id:`user-${i}`,type:'image',url:`blob:user-${i}`,title:`Image ${i}`}));
    const uploaded=montageEdit(localMontageBase(clip,all),{status:'unavailable',reason:'not_requested'},'pulse',{});
    assert.equal(uploaded.assets.length,8);assert.equal(new Set(uploaded.shots.map(s=>s.assetId)).size,8);
    const ten=Array.from({length:10},(_,i)=>({id:`user-${i}`,type:'image',url:`blob:user-${i}`,title:`Image ${i}`}));
    for(const style of ['pulse','contrast','flow']){const edit=montageEdit(localMontageBase(clip,ten),analysis,style,{});assert.equal(new Set(edit.shots.map(s=>s.assetId)).size,10);}
    const short={...base,shots:base.shots.map((shot,i)=>({...shot,sourceOutMs:i===2?6000:2000}))};
    const repeated=montageEdit(short,analysis,'flow',{});
    for(let i=1;i<repeated.shots.length;i++)if(repeated.shots[i-1].assetId===repeated.shots[i].assetId)assert.equal(repeated.shots[i].transition.type,'cut');
    const multipleRanges={...base,shots:[...base.shots,{...base.shots[0],sourceInMs:2000,sourceOutMs:2500}]};
    assert.equal(montageEdit(multipleRanges,analysis,'flow',movement).shots.at(-1).endFrame,450);
    const narrow={...base,shots:base.shots.map(shot=>({...shot,sourceOutMs:2500}))};
    const clipped=montageEdit(narrow,analysis,'pulse',movement);assert.equal(clipped.shots.at(-1).endFrame,450);assert.ok(clipped.shots.every(shot=>shot.sourceOutMs<=2500));
    const uneven={...base,shots:base.shots.map((shot,i)=>({...shot,sourceOutMs:i===0?9000:i===1?3500:3000}))};
    const varied=montageEdit(uneven,analysis,'flow',movement);assert.equal(new Set(varied.shots.map(shot=>shot.assetId)).size,3);
  } finally {await server.close();}
});
