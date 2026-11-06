import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('Visual Curiosity reacts only to measured events and is reproducible without analysis', async () => {
  const server = await createServer({ server: { middlewareMode:true, hmr:false }, appType:'custom', logLevel:'error' });
  try {
    const { curiosityFrame, curiosityMusicFrom } = await server.ssrLoadModule('/src/visual-curiosity.ts');
    const music = { beatsMs:[1000], onsetsMs:[2000], energy:[{timeMs:0,rms:.1},{timeMs:1000,rms:.8}] };
    assert.ok(curiosityFrame(30,music,7).beat > curiosityFrame(0,music,7).beat);
    assert.ok(curiosityFrame(60,music,7).onset > curiosityFrame(30,music,7).onset);
    assert.equal(curiosityFrame(0,null,7).beat,0);
    assert.deepEqual(curiosityFrame(125,null,7),curiosityFrame(125,null,7));
    assert.notDeepEqual(curiosityFrame(125,null,7),curiosityFrame(125,null,8));
    assert.equal(curiosityMusicFrom({rhythm:{beatsMs:[]},features:{transientsMs:[],frames:[null,{timeMs:0,rms:'bad'}]}}),null);
    assert.deepEqual(curiosityMusicFrom({rhythm:{beatsMs:[null,1000]},features:{transientsMs:[],frames:[null,{timeMs:0,rms:.4}]}}),{beatsMs:[1000],onsetsMs:[],energy:[{timeMs:0,rms:.4}]});
  } finally { await server.close(); }
});
