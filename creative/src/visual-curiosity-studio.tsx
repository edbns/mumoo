import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMES, HEIGHT, WIDTH, playheadFrame, type Composition } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { CURIOSITY_STYLES, curiosityMusicFrom, drawCuriosity, type CuriosityMusic, type CuriosityStyle } from './visual-curiosity';
import { renderMp4 } from './browser-export';
import { loadFont } from './render';

function musicFor(profile: CreativeProfileV1): CuriosityMusic | null {
  if (profile.musicAnalysis.status !== 'ready') return null;
  return curiosityMusicFrom(profile.musicAnalysis.result);
}

export function VisualCuriosityStudio({ profile, composition, audio, position, playing, playbackError, onPlay, onStop, onSeek, onBack, onOther, onMedia }: {
  profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; position: number; playing: boolean; playbackError: string;
  onPlay: () => void; onStop: () => void; onSeek: (ms:number) => void; onBack: () => void; onOther: () => void; onMedia: () => void;
}) {
  const canvas=useRef<HTMLCanvasElement>(null); const [style,setStyle]=useState<CuriosityStyle>('liquid');
  const [progress,setProgress]=useState<number>(); const [error,setError]=useState(''); const [fontReady,setFontReady]=useState(false);
  const music=useMemo(()=>musicFor(profile),[profile.musicAnalysis]);
  const seed=parseInt(profile.clip.sourceSha256.slice(0,8),16) || 0;
  const cueKey=JSON.stringify(composition.version === 2 ? composition.cues : [composition.lyric]);
  useEffect(()=>{let alive=true;setFontReady(false);void loadFont(composition.version === 2 ? composition.cues.map(c=>c.text).join(' ') : composition.lyric.text).then(()=>{if(alive)setFontReady(true);}).catch(()=>{if(alive)setError('The preview font could not be loaded.');});return()=>{alive=false;};},[cueKey]);
  useEffect(()=>{if(fontReady && canvas.current) drawCuriosity(canvas.current,style,composition,playheadFrame(position),music,seed);},[fontReady,style,position,music,seed,cueKey]);
  async function download() {
    if (!fontReady || progress !== undefined) return; onStop(); setError(''); setProgress(0);
    try { const blob=await renderMp4(composition,audio,frame=>setProgress(Math.floor(frame/FRAMES*100)),(target,frame)=>drawCuriosity(target,style,composition,frame,music,seed));
      const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=`mumoo-visual-curiosity-${style}.mp4`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'The video could not be exported.');} finally {setProgress(undefined);}
  }
  return <main className="desktop gallery-page"><section className="gallery-shell">
    <p className="eyebrow">YOUR MUSIC VIDEO</p><h1>Visual Curiosity</h1><p className="intro">Unexpected movement, made for your music.</p>
    <div className="trim-actions"><button className="secondary" disabled={progress!==undefined} onClick={onBack}>Back to music</button><button className="secondary" disabled={progress!==undefined} onClick={onOther}>{profile.videoType==='visual'?'Human Magnet':'Lyric formats'}</button>{profile.videoType==='visual' && <button className="secondary" disabled={progress!==undefined} onClick={onMedia}>Other visuals</button>}</div>
    <div className="daily-designs" role="group" aria-label="Choose a visual style">{CURIOSITY_STYLES.map(item=><button key={item.id} type="button" disabled={progress!==undefined} aria-pressed={style===item.id} onClick={()=>setStyle(item.id)}>{item.name}</button>)}</div>
    <p className="hint">{CURIOSITY_STYLES.find(item=>item.id===style)?.description}</p>
    {profile.musicAnalysis.status==='pending' && <p role="status">Finishing music analysis…</p>}
    {(profile.musicAnalysis.status==='error' || (profile.musicAnalysis.status==='ready' && !music)) && <p className="hint">Music analysis is unavailable; this style will use its ambient motion.</p>}
    {error && <p role="alert">{error}</p>}{playbackError && <p role="alert">{playbackError}</p>}
    <div className="gallery-user-preview"><canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Visual Curiosity preview" onContextMenu={event=>event.preventDefault()} /><span className="preview-mark">PREVIEW</span></div>
    <div className="trim-actions"><button disabled={!fontReady || progress!==undefined} onClick={()=>playing?onStop():onPlay()}>{playing?'Pause':'Play'}</button><button disabled={!fontReady || progress!==undefined || profile.musicAnalysis.status==='pending'} onClick={()=>void download()}>Download MP4</button></div>
    <label className="daily-seek">Seek preview<input type="range" min={0} max={15000} step={1} value={Math.floor(position)} disabled={progress!==undefined} onChange={event=>onSeek(event.target.valueAsNumber)} /></label>
    {progress!==undefined && <p role="status">Rendering video · {progress}%</p>}
  </section></main>;
}
