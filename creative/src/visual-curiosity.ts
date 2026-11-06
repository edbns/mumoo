import { evaluate, HEIGHT, WIDTH, type Composition } from './composition';

export type CuriosityStyle = 'liquid' | 'glass' | 'fold';
export type CuriosityMusic = { beatsMs: number[]; onsetsMs: number[]; energy: { timeMs: number; rms: number }[] };
export const CURIOSITY_STYLES: { id: CuriosityStyle; name: string; description: string }[] = [
  { id:'liquid', name:'Liquid Light', description:'Sculptural flowing light.' },
  { id:'glass', name:'Glass Shift', description:'Layered translucent surfaces.' },
  { id:'fold', name:'Soft Fold', description:'Moving folds and shadows.' },
];
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
/** Treat malformed or absent observations as unavailable, never as music. */
export function curiosityMusicFrom(value: unknown): CuriosityMusic | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as { rhythm?: { beatsMs?: unknown }; features?: { transientsMs?: unknown; frames?: unknown } };
  const times = (raw: unknown, max: number) => Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 15000).slice(0,max) : [];
  const frames = Array.isArray(data.features?.frames) ? data.features.frames : [];
  const energy = frames.filter((item): item is {timeMs:number;rms:number} => item !== null && typeof item === 'object' && typeof item.timeMs === 'number' && Number.isFinite(item.timeMs) && item.timeMs >= 0 && item.timeMs < 15000 && typeof item.rms === 'number' && Number.isFinite(item.rms) && item.rms >= 0 && item.rms <= 1).slice(0,2000).map(({timeMs,rms})=>({timeMs,rms}));
  const beatsMs=times(data.rhythm?.beatsMs,500),onsetsMs=times(data.features?.transientsMs,1000);
  return beatsMs.length || onsetsMs.length || energy.length ? { beatsMs,onsetsMs,energy } : null;
}
function impulse(events: number[], time: number, decay: number) {
  let value = 0;
  for (const event of events) { const elapsed = time - event; if (elapsed >= 0 && elapsed < 1200) value = Math.max(value, Math.exp(-elapsed / decay)); }
  return value;
}
/** Same integer frame and clip-bound observations produce the same parameters. */
export function curiosityFrame(frame: number, music: CuriosityMusic | null, seed: number) {
  const time = frame * 1000 / 30;
  const nearest = music?.energy.reduce<{timeMs:number; rms:number} | null>((best, item) => item.timeMs <= time && (!best || item.timeMs > best.timeMs) ? item : best, null);
  return { time: frame / 30, beat: impulse(music?.beatsMs ?? [], time, 190), onset: impulse(music?.onsetsMs ?? [], time, 110), energy: nearest ? clamp(nearest.rms) : .2, phase: (seed % 997) / 997 * Math.PI * 2 };
}

/** Original vector artwork; shared by browser preview and MP4 export. */
export function drawCuriosity(canvas: HTMLCanvasElement, style: CuriosityStyle, composition: Composition, frame: number, music: CuriosityMusic | null, seed: number) {
  const c = canvas.getContext('2d'); if (!c) throw new Error('Canvas is unavailable.');
  const { time, beat, onset, energy, phase } = curiosityFrame(frame, music, seed);
  c.save(); c.scale(canvas.width / WIDTH, canvas.height / HEIGHT); c.fillStyle = style === 'liquid' ? '#100c16' : style === 'glass' ? '#08191d' : '#1c1021'; c.fillRect(0,0,WIDTH,HEIGHT);
  if (style === 'liquid') {
    const glow = c.createRadialGradient(550,850,40,550,850,850); glow.addColorStop(0,'#8d3c3e'); glow.addColorStop(.5,'#311421'); glow.addColorStop(1,'#100c16'); c.fillStyle=glow; c.fillRect(0,0,WIDTH,HEIGHT);
    for (let i=0;i<7;i++) { const drift=Math.sin(time*.33+phase+i*.7)*70, y=380+i*185+drift;
      const g=c.createLinearGradient(0,y,WIDTH,y+300); g.addColorStop(0,i%2?'#ffb07d':'#9f3d45');g.addColorStop(.48,'#f2b99c');g.addColorStop(1,'#37152d');
      c.beginPath();c.moveTo(-180,y);c.bezierCurveTo(230,y-170-40*beat,690,y+210,1260,y-70);c.lineTo(1260,y+72+energy*40);c.bezierCurveTo(720,y+285,260,y-75,-180,y+120);c.closePath();c.fillStyle=g;c.globalAlpha=.55+i*.045;c.fill(); }
  } else if (style === 'glass') {
    const bg=c.createLinearGradient(0,0,WIDTH,HEIGHT);bg.addColorStop(0,'#07171b');bg.addColorStop(.55,'#1c5359');bg.addColorStop(1,'#10121e');c.fillStyle=bg;c.fillRect(0,0,WIDTH,HEIGHT);
    c.save();c.translate(WIDTH/2,HEIGHT/2);c.rotate(.14+Math.sin(time*.22+phase)*.07);
    for(let i=0;i<5;i++){const x=-470+i*210+Math.sin(time*.3+phase+i)*35;const g=c.createLinearGradient(x,-700,x+300,700);g.addColorStop(0,'rgba(196,251,240,.05)');g.addColorStop(.48,`rgba(193,248,238,${.15+energy*.2})`);g.addColorStop(1,'rgba(18,42,54,.15)');c.fillStyle=g;c.strokeStyle='rgba(222,255,247,.4)';c.lineWidth=3+onset*2;c.beginPath();c.moveTo(x,-1100);c.lineTo(x+260,-1000);c.lineTo(x+385,1100);c.lineTo(x+100,1100);c.closePath();c.fill();c.stroke();}c.restore();
    const glow=c.createRadialGradient(780,520,10,780,520,580);glow.addColorStop(0,'rgba(190,255,234,.4)');glow.addColorStop(1,'rgba(190,255,234,0)');c.fillStyle=glow;c.fillRect(0,0,WIDTH,HEIGHT);
  } else {
    const bg=c.createLinearGradient(0,0,0,HEIGHT);bg.addColorStop(0,'#421c39');bg.addColorStop(.55,'#b06c76');bg.addColorStop(1,'#251224');c.fillStyle=bg;c.fillRect(0,0,WIDTH,HEIGHT);
    for(let i=0;i<9;i++){const x=-200+i*180, sway=Math.sin(time*.25+phase+i*.55)*95;const g=c.createLinearGradient(x,0,x+290,0);g.addColorStop(0,'rgba(25,8,28,.78)');g.addColorStop(.45,'rgba(255,204,187,.50)');g.addColorStop(1,'rgba(49,15,43,.72)');c.fillStyle=g;c.beginPath();c.moveTo(x,-100);c.bezierCurveTo(x+320+sway,450,x-180-sway,1050,x+260+beat*25,2020);c.lineTo(x+420,2020);c.bezierCurveTo(x+20,1100,x+450+sway,430,x+210,-100);c.closePath();c.fill();}
  }
  c.globalAlpha=1;
  const text=evaluate(composition,frame).text;
  if(text){c.font='800 112px "Inter Variable"';c.textAlign='center';c.textBaseline='middle';c.lineWidth=10;c.strokeStyle='rgba(0,0,0,.55)';c.fillStyle='#fff';c.strokeText(text,WIDTH/2,HEIGHT*.66,WIDTH*.82);c.fillText(text,WIDTH/2,HEIGHT*.66,WIDTH*.82);}
  c.restore();
}
