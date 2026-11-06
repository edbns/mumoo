import { validAccess, valid } from './brain-gateway.mjs';
import { randomUUID } from 'node:crypto';
import visionResearch from '../lib/vision-research.mjs';
const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const BRAIN = 'https://mumoo-brain-staging.netlify.app/api/media';
const response = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
// Construct a minimal server-to-server request; never forward arbitrary nested data.
function musicOnlyProfile(p) {
  const m = p?.measured, c = p?.creator;
  if (!m || !c || typeof c.primaryGenre !== 'string' || !Array.isArray(m.beatsMs) || !Array.isArray(m.onsetsMs) || !Array.isArray(m.envelope) || !m.tempo || (m.temporal && (!Array.isArray(m.temporal.bins) || !Array.isArray(m.temporal.segments)))) throw new Error('Invalid music profile.');
  const number = v => v === null || (typeof v === 'number' && Number.isFinite(v));
  const timing = a => a.length <= 1000 && a.every(v => Number.isSafeInteger(v) && v >= 0 && v < 15000);
  const validBands = b => b && ['low','lowMid','midHighMid','high'].every(k => number(b[k]));
  const t = m.temporal;
  if (!timing(m.beatsMs) || !timing(m.onsetsMs) || m.envelope.length > 30 || m.envelope.some(b => !b || !number(b.startMs) || !number(b.endMs) || !number(b.rmsMean) || !number(b.onsetMean)) || !['estimated','ambiguous','unavailable'].includes(m.tempo.status) || ['bpm','gridBpm','intervalCount','supportFraction'].some(k => m.tempo[k] !== undefined && !number(m.tempo[k])) || (m.tempo.alternativesBpm !== undefined && (!Array.isArray(m.tempo.alternativesBpm) || m.tempo.alternativesBpm.length>4 || m.tempo.alternativesBpm.some(v=>!number(v)))) || (t && (t.version!==1 || t.durationMs!==15000 || !['available','unavailable'].includes(t.status) || t.bins.length!==15 || t.segments.length<1 || t.segments.length>6 || t.bins.some(b=>!b || ![b.startMs,b.endMs,b.relativeEnergy,b.onsetCount].every(number) || !validBands(b.bandShares)) || t.segments.some(b=>!b || ![b.startMs,b.endMs,b.relativeEnergy,b.onsetsPerSecond,b.beatCount,b.energyChange].every(number) || !validBands(b.bandShares))))) throw new Error('Invalid music data.');
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
  const band = b => pick(b, ['low','lowMid','midHighMid','high']);
  const temporal = m.temporal && { ...pick(m.temporal, ['version','status','durationMs']), bins: m.temporal.bins.map(b => ({ ...pick(b, ['startMs','endMs','relativeEnergy','onsetCount']), bandShares: band(b.bandShares) })), segments: m.temporal.segments.map(b => ({ ...pick(b, ['startMs','endMs','relativeEnergy','onsetsPerSecond','beatCount','energyChange']), bandShares: band(b.bandShares) })) };
  return { version:p.version, durationMs:p.durationMs, clipSha256:p.clipSha256, videoType:p.videoType, creator:pick(c,['primaryGenre','influence']), measured: { tempo:pick(m.tempo,['status','bpm','gridBpm','alternativesBpm','intervalCount','supportFraction']), beatsMs:m.beatsMs, onsetsMs:m.onsetsMs, envelope:m.envelope.map(b => pick(b,['startMs','endMs','rmsMean','onsetMean'])), ...(temporal && {temporal}) }, lyricCues:[], unavailable:[] };
}

async function processRequest(request) {
  if (process.env.SITE_ID !== SITE || new URL(request.url).origin !== ORIGIN) return response(404, 'Not available.');
  if (request.method !== 'POST') return response(405, 'Use POST.');
  if (request.headers.get('origin') !== ORIGIN) return response(403, 'Open MUMOO Staging.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') || '', process.env.MUMOO_BRAIN_TESTER_KEY)) return response(401, 'Staging access is invalid or expired.');
  const secret = process.env.MUMOO_BRAIN_SERVICE_SECRET || ''; if (secret.length < 32) return response(503, 'Media service unavailable.');
  const contentType = request.headers.get('content-type') || '';
  if (/^video\/mp4(?:\s*;|$)/i.test(contentType)) {
    try {
      const tags = request.headers.get('x-mumoo-tags') || '';
      if (request.headers.get('x-mumoo-operation') !== 'staging-upload' || !/^(?:|(?:street|night|people|motion|nature|landscape|fashion|performance)(?:,(?:street|night|people|motion|nature|landscape|fashion|performance)){0,3})$/.test(tags) || Number(request.headers.get('content-length')) > 4 * 1024 * 1024) return response(400, 'Invalid staging footage.');
      const bytes = await request.arrayBuffer(); if (bytes.byteLength > 4 * 1024 * 1024) return response(413, 'File too large.');
      const upstream = await fetch(BRAIN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000), headers: { 'content-type': 'video/mp4', authorization: `Bearer ${secret}`, 'x-mumoo-operation': 'staging-upload', 'x-mumoo-tags': tags }, body: bytes });
      if (!upstream.ok) return response(502, 'Staging footage unavailable.');
      return Response.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } });
    } catch { return response(503, 'Staging footage unavailable.'); }
  }
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return response(415, 'Expected JSON.');
  try {
    if (Number(request.headers.get('content-length')) > 32000) return response(413, 'Request too large.');
    const preview = await request.clone().arrayBuffer(); if (preview.byteLength > 32000) return response(413, 'Request too large.');
    const operation = JSON.parse(new TextDecoder().decode(preview))?.operation;
    if (operation === 'vision-start' || operation === 'vision-poll') return visionResearch(request);
  } catch { return response(400, 'Invalid request.'); }
  try {
    if (Number(request.headers.get('content-length')) > 16384) return response(413, 'Request too large.');
    const bytes = await request.arrayBuffer(); if (bytes.byteLength > 16384) return response(413, 'Request too large.');
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input) || !['discover', 'discover-video', 'review', 'review-many', 'list', 'recommend', 'director', 'asset', 'research-discover', 'research-list', 'research-review', 'research-retain', 'pixabay-search', 'pixabay-review', 'research-plan', 'research-asset', 'fast-plan', 'human-plan'].includes(input.operation)) return response(400, 'Invalid request.');
    const allowed = { discover: ['operation', 'query'], 'discover-video': ['operation', 'query'], review: ['operation', 'id', 'status'], 'review-many': ['operation', 'ids', 'status'], list: ['operation'], recommend: ['operation', 'profile'], director: ['operation', 'profile', 'onsetsMs'], asset: ['operation', 'id'], 'research-discover': ['operation', 'provider', 'query', 'unit', 'shard'], 'research-list': ['operation', 'offset'], 'research-review': ['operation', 'id', 'rightsStatus', 'adSafety'], 'research-retain': ['operation', 'id'], 'pixabay-search': ['operation', 'query'], 'pixabay-review': ['operation', 'query', 'id', 'rightsStatus', 'adSafety'], 'research-plan': ['operation', 'profile', 'onsetsMs', 'stagingOwned', 'stagingPixabay'], 'research-asset': ['operation', 'id', 'query'], 'fast-plan': ['operation','profile','seed','previousIds'], 'human-plan': ['operation','profile','seed','treatment','observations'] };
    if (Object.keys(input).some(key => !allowed[input.operation].includes(key))) return response(400, 'Invalid request.');
    if (input.operation === 'fast-plan' && (!input.profile || input.profile.version !== 1 || input.profile.durationMs !== 15000 || !['visual','lyric'].includes(input.profile.videoType) || !/^[a-f0-9]{64}$/.test(input.profile.clipSha256 || '') || !Array.isArray(input.profile.lyricCues) || input.profile.lyricCues.length > 120 || input.profile.lyricCues.length !== 0 || !Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 2147483647 || !Array.isArray(input.previousIds) || input.previousIds.length > 4 || input.previousIds.some(id => !/^pixabay-\d+$/.test(id)))) return response(400, 'Invalid request.');
    if (input.operation === 'fast-plan') { try { input.profile = musicOnlyProfile(input.profile); } catch { return response(400, 'Invalid music profile.'); } }
    if (input.operation === 'human-plan') {
      if (!input.profile || input.profile.version !== 1 || input.profile.durationMs !== 15000 || !['visual','lyric'].includes(input.profile.videoType) || !/^[a-f0-9]{64}$/.test(input.profile.clipSha256 || '') || !Array.isArray(input.profile.lyricCues) || input.profile.lyricCues.length !== 0 || !Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 2147483647 || !['face','movement','fashion','presence'].includes(input.treatment) || !Array.isArray(input.observations) || input.observations.length > 3) return response(400, 'Invalid request.');
      const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
      if (input.observations.some(item => !item || Object.keys(item).some(k => !['id','samples'].includes(k)) || !/^pixabay-\d+$/.test(item.id || '') || !Array.isArray(item.samples) || item.samples.length < 1 || item.samples.length > 3 || item.samples.some(s => !s || Object.keys(s).some(k => !['offsetMs','motion','faceX','faceY'].includes(k)) || !Number.isSafeInteger(s.offsetMs) || s.offsetMs < 0 || s.offsetMs > 120000 || !unit(s.motion) || !(s.faceX === null && s.faceY === null || unit(s.faceX) && unit(s.faceY))))) return response(400, 'Invalid observation.');
      try { input.profile = musicOnlyProfile(input.profile); } catch { return response(400, 'Invalid music profile.'); }
    }
    if (['recommend', 'director', 'research-plan'].includes(input.operation) && (!valid(input.profile) || !input.profile.music)) return response(400, 'Music analysis is required.');
    if (['director', 'research-plan'].includes(input.operation) && (!Array.isArray(input.onsetsMs) || input.onsetsMs.length > 1000 || input.onsetsMs.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n >= 15000 || (i && n < input.onsetsMs[i - 1])))) return response(400, 'Invalid timing.');
    if (['discover', 'discover-video'].includes(input.operation) && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80)) return response(400, 'Invalid search.');
    if (input.operation === 'review' && (typeof input.id !== 'string' || !/^(?:met|commons)-\d+$/.test(input.id) || !['approved', 'rejected'].includes(input.status))) return response(400, 'Invalid review.');
    if (input.operation === 'asset' && (typeof input.id !== 'string' || !/^met-\d+$/.test(input.id))) return response(400, 'Invalid asset.');
    if (input.operation === 'review-many' && (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 25 || input.ids.some(id => typeof id !== 'string' || !/^(?:met|commons)-\d+$/.test(id)) || !['approved', 'rejected'].includes(input.status))) return response(400, 'Invalid review.');
    if (input.operation === 'research-discover' && (!['cleveland', 'smithsonian', 'commons'].includes(input.provider) || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80 || (input.provider === 'smithsonian' && (!['nasm', 'nmah', 'saam', 'chndm', 'eepa', 'nmnhbotany'].includes(input.unit) || !/^[a-f0-9]{2}$/.test(input.shard))))) return response(400, 'Invalid search.');
    if (['pixabay-search', 'pixabay-review'].includes(input.operation) && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80)) return response(400, 'Invalid search.');
    if (input.operation === 'pixabay-review' && (typeof input.id !== 'string' || !/^pixabay-\d+$/.test(input.id) || !['APPROVED', 'REJECTED'].includes(input.rightsStatus) || !['SAFE', 'REVIEW_REQUIRED', 'BLOCKED'].includes(input.adSafety))) return response(400, 'Invalid review.');
    if (input.operation === 'research-list' && input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 10000)) return response(400, 'Invalid request.');
    if (['research-review', 'research-retain', 'research-asset'].includes(input.operation) && (typeof input.id !== 'string' || !(input.operation === 'research-asset' ? /^(?:cma-\d+|si-[a-f0-9]{24}|commons2-\d+|owned-[a-f0-9]{24}|pixabay-\d+)$/ : /^(?:cma-\d+|si-[a-f0-9]{24}|commons2-\d+)$/).test(input.id))) return response(400, 'Invalid asset.');
    if (input.operation === 'research-asset' && input.id.startsWith('pixabay-') && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80)) return response(400, 'Invalid request.');
    if (input.operation === 'research-asset' && !input.id.startsWith('pixabay-') && input.query !== undefined) return response(400, 'Invalid request.');
    if (input.operation === 'research-plan' && input.stagingPixabay !== undefined && input.stagingPixabay !== true) return response(400, 'Invalid request.');
    if (input.operation === 'research-plan' && input.stagingOwned !== undefined && input.stagingOwned !== true) return response(400, 'Invalid request.');
    if (input.operation === 'research-review' && (!['APPROVED', 'REJECTED'].includes(input.rightsStatus) || !['SAFE', 'REVIEW_REQUIRED', 'BLOCKED'].includes(input.adSafety))) return response(400, 'Invalid review.');
    const ownedAsset = input.operation === 'research-asset' && input.id.startsWith('owned-');
    const pixabayAsset = input.operation === 'research-asset' && input.id.startsWith('pixabay-');
    const result = await fetch(BRAIN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000), headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(ownedAsset ? { operation: 'staging-asset', id: input.id } : pixabayAsset ? { operation: 'pixabay-staging-asset', id: input.id, query: input.query } : input) });
    if (!result.ok) return response(502, 'Media service unavailable.');
    if (ownedAsset) {
      if (!/^video\/mp4(?:\s*;|$)/i.test(result.headers.get('content-type') || '') || Number(result.headers.get('content-length')) > 4 * 1024 * 1024) return response(502, 'Media unavailable.');
      const bytes = await result.arrayBuffer(); if (bytes.byteLength > 4 * 1024 * 1024) return response(502, 'Media unavailable.');
      return new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const data = await result.json();
    if (input.operation === 'research-asset') {
      const url = new URL(data.renderUrl); const isVideo = data.type === 'video';
      const validHost = isVideo ? (pixabayAsset ? url.hostname === 'cdn.pixabay.com' : url.hostname === 'upload.wikimedia.org' && url.pathname.endsWith('.webm') && !url.search) : data.type === 'image' && (url.hostname === 'openaccess-cdn.clevelandart.org' || (url.hostname === 'ids.si.edu' && ['/ids/deliveryService', '/ids/download'].includes(url.pathname)));
      if (!validHost || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return response(502, 'Media service unavailable.');
      const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(); const max = 5 * 1024 * 1024;
      if (!upstream.ok || !(isVideo ? (pixabayAsset ? type === 'video/mp4' : type === 'video/webm') : ['image/jpeg', 'image/png', 'image/webp'].includes(type)) || Number(upstream.headers.get('content-length')) > max || !upstream.body) return response(502, 'Media unavailable.');
      const reader = upstream.body.getReader(), chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); return response(502, 'Media unavailable.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (input.operation === 'asset') {
      const url = new URL(data.previewUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'images.metmuseum.org' || url.port || url.username || url.password) return response(502, 'Media service unavailable.');
      const image = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const type = image.headers.get('content-type') || '';
      const max = 5 * 1024 * 1024;
      if (!image.ok || !/^image\/(jpeg|png|webp)$/i.test(type) || Number(image.headers.get('content-length')) > max || !image.body) return response(502, 'Image unavailable.');
      const reader = image.body.getReader(); const chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); return response(502, 'Image unavailable.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return response(503, 'Media service unavailable.'); }
}
export default async function handler(request) {
  const requestId = randomUUID(), started = Date.now();
  let result;
  try { result = await processRequest(request); } catch { result = response(500, 'Media service unavailable.'); }
  console.info(JSON.stringify({ event: 'media_gateway', requestId, time: new Date(started).toISOString(), status: result.status, durationMs: Date.now() - started,
    category: result.status === 200 ? 'success' : result.status === 401 || result.status === 403 ? 'access_denied' : result.status >= 500 ? 'service_unavailable' : 'request_rejected' }));
  result.headers.set('X-Mumoo-Request-Id', requestId); return result;
}
// A Human Magnet style needs one plan, three bounded media fetches and one
// refinement. Allow four styles per minute while retaining authenticated,
// per-IP limits and the separate upstream/provider quotas.
export const config = { path: '/api/media-catalog', rateLimit: { windowSize: 60, windowLimit: 25, aggregateBy: ['ip'] } };
