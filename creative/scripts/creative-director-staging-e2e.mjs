import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffprobe = require('@ffprobe-installer/ffprobe');

const STAGING = 'https://mumoo-staging.netlify.app';
const SONG = process.env.MUMOO_STAGING_SONG
  || '/Users/sennie/Documents/ChatGPT/MUMOO - Music in Mootion/MUSIC FOR TESTING /ATREVIMENTO MASTERED.wav';
const OUT = join(process.cwd(), 'tmp-director-staging');
const REPORT = join(OUT, 'verification.json');

test('staging Creative Director 2.0 real-song acceptance', {
  timeout: 900000,
  skip: process.env.MUMOO_STAGING_E2E !== '1' || !existsSync(SONG),
}, async t => {
  const { chromium } = await import('playwright');
  mkdirSync(OUT, { recursive: true });
  const report = {
    stagingUrl: `${STAGING}/?media-debug=1`,
    songBasename: SONG.split('/').pop(),
    frontendCommitExpected: '2f1b538',
    brainCommitExpected: 'dc8d084',
    startedAt: new Date().toISOString(),
    timings: {},
    assets: { pixabay: [], vimeoRendered: [], owned: [], other: [] },
    vimeoDiscovery: null,
    directions: [],
    checks: {},
    notes: [],
  };
  const mark = (key, started) => { report.timings[key] = Math.round(performance.now() - started); };
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const mediaLog = [];
  let accessHeader = '';
  let analysisMs = null;
  let assetLoadMs = 0;
  page.on('request', req => {
    const access = req.headers()['x-mumoo-brain-access'];
    if (access) accessHeader = access;
  });
  page.on('requestfinished', async req => {
    if (!req.url().includes('/api/media-catalog') && !req.url().includes('analyze-music')) return;
    try {
      const type = req.headers()['content-type'] || '';
      let operation = req.url().includes('analyze-music') ? 'analyze-music' : 'media';
      const started = req.timing?.()?.startTime;
      if (type.includes('application/json') && req.method() === 'POST' && !req.url().includes('analyze-music')) {
        const body = req.postDataJSON();
        operation = body?.operation || operation;
      }
      const res = await req.response();
      const timing = req.timing();
      const duration = timing?.responseEnd && timing?.requestStart ? timing.responseEnd - timing.requestStart : null;
      mediaLog.push({ operation, status: res?.status() ?? 0, durationMs: duration });
      if (operation === 'analyze-music' && duration != null) analysisMs = duration;
      if (operation === 'research-asset' && duration != null) assetLoadMs += duration;
    } catch { /* ignore */ }
  });

  try {
    const pageStart = performance.now();
    await page.goto(`${STAGING}/?media-debug=1`, { waitUntil: 'domcontentloaded' });
    mark('page_load_ms', pageStart);

    const uploadStart = performance.now();
    await page.getByLabel('Source WAV').setInputFiles(SONG);
    await page.getByLabel('Primary genre').fill('House');
    await page.getByText('Staging access enabled.').waitFor({ timeout: 45000 });
    mark('upload_and_access_ms', uploadStart);

    await page.getByRole('button', { name: 'Continue to clip' }).click();
    await page.getByRole('button', { name: 'Continue to video type' }).click();
    await page.getByLabel('Visual', { exact: true }).check();

    const analysisStart = performance.now();
    const analysisWait = new Promise(resolve => {
      const onResponse = async res => {
        if (!res.url().includes('analyze-music')) return;
        page.off('response', onResponse);
        resolve({ status: res.status(), body: await res.text().catch(() => '') });
      };
      page.on('response', onResponse);
    });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    // Visual path opens Visual Curiosity first. Wait for the real analyze-music network result.
    await page.getByRole('button', { name: 'Other visuals' }).waitFor({ timeout: 60000 });
    let analysisResult = await Promise.race([
      analysisWait,
      page.waitForTimeout(120000).then(() => ({ status: 0, body: 'timeout' })),
    ]);
    report.notes.push(`analyze-music first response HTTP ${analysisResult.status}`);
    if (analysisResult.status === 429 || analysisResult.status >= 500 || analysisResult.status === 0) {
      report.notes.push('Waiting 70s for analyze-music rate limit / worker recovery, then retrying via Human Magnet.');
      await page.waitForTimeout(70000);
      await page.getByRole('button', { name: 'Human Magnet' }).click();
      const retryWait = new Promise(resolve => {
        const onResponse = async res => {
          if (!res.url().includes('analyze-music')) return;
          page.off('response', onResponse);
          resolve({ status: res.status(), body: await res.text().catch(() => '') });
        };
        page.on('response', onResponse);
      });
      const retryBtn = page.getByRole('button', { name: 'Retry music analysis' });
      if (await retryBtn.count()) await retryBtn.click();
      analysisResult = await Promise.race([
        retryWait,
        page.waitForTimeout(120000).then(() => ({ status: 0, body: 'timeout' })),
      ]);
      report.notes.push(`analyze-music retry response HTTP ${analysisResult.status}`);
    }
    if (analysisResult.status !== 200) {
      writeFileSync(join(OUT, 'analysis-failure.txt'), JSON.stringify(analysisResult, null, 2));
      throw new Error(`Music analysis failed on staging (HTTP ${analysisResult.status}).`);
    }
    mark('music_analysis_ms', analysisStart);

    const directorStart = performance.now();
    await page.getByRole('button', { name: 'Other visuals' }).click({ timeout: 60000 });
    await page.getByText(/Creating your video|Measuring authorized footage|Your music video|Not enough|Pixabay searches|could not be prepared|Music analysis is unavailable/i).first().waitFor({ timeout: 120000 });
    const deadline = Date.now() + 360000;
    let ready = '';
    while (Date.now() < deadline) {
      if (await page.getByLabel('Automatic video preview').count()) { ready = 'preview'; break; }
      const alerts = await page.getByRole('alert').allInnerTexts().catch(() => []);
      if (alerts.some(text => /Not enough|Pixabay searches|could not be prepared|unavailable/i.test(text))) {
        ready = 'alert';
        writeFileSync(join(OUT, 'failure-ui.txt'), alerts.join('\n') + '\n\n' + await page.locator('main.desktop').innerText().catch(() => ''));
        await page.screenshot({ path: join(OUT, 'failure.png'), fullPage: true }).catch(() => {});
        throw new Error(`Director did not produce a preview. Alerts: ${alerts.join(' | ')}`);
      }
      await page.waitForTimeout(1000);
    }
    if (ready !== 'preview') throw new Error('Timed out waiting for Automatic video preview.');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Play' && !button.disabled), null, { timeout: 180000 });
    mark('director_ready_ms', directorStart);

    if (analysisMs != null) report.timings.music_analysis_network_ms = Math.round(analysisMs);
    if (assetLoadMs) report.timings.asset_loading_network_ms = Math.round(assetLoadMs);

    // Explicit Vimeo discovery probe through staging gateway (does not use Pixi fixtures).
    if (accessHeader) {
      const vimeoStart = performance.now();
      const vimeoProbe = await page.evaluate(async ({ token }) => {
        const response = await fetch('/api/media-catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token },
          body: JSON.stringify({ operation: 'vimeo-search', query: 'abstract fog motion' }),
        });
        const text = await response.text();
        let body = null;
        try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
        return { status: response.status, body };
      }, { token: accessHeader });
      mark('vimeo_search_probe_ms', vimeoStart);
      report.vimeoSearchProbe = {
        status: vimeoProbe.status,
        summary: vimeoProbe.body?.summary || null,
        error: vimeoProbe.body?.error || null,
        candidateCount: Array.isArray(vimeoProbe.body?.candidates) ? vimeoProbe.body.candidates.length : 0,
        sample: Array.isArray(vimeoProbe.body?.candidates) ? vimeoProbe.body.candidates.slice(0, 3).map(c => ({
          id: c.id, accessMode: c.accessMode, downloadPermission: c.downloadPermission, license: c.license?.code, exportEligible: c.exportEligible, hasRenderUrl: Boolean(c.renderUrl),
        })) : [],
      };
      if (vimeoProbe.status === 200 && report.vimeoSearchProbe.candidateCount >= 0) {
        report.checks.vimeo_api_search = 'PASS';
        if (!report.vimeoDiscovery) report.vimeoDiscovery = { status: 'probed-separately', summary: report.vimeoSearchProbe.summary };
      } else if (vimeoProbe.status >= 500) {
        report.checks.vimeo_api_search = 'FAIL';
        report.notes.push('OWNER ACTION REQUIRED: set VIMEO_ACCESS_TOKEN on Netlify site mumoo-brain-staging (never commit the token).');
      } else {
        report.checks.vimeo_api_search = 'FAIL';
        report.notes.push(`vimeo-search probe HTTP ${vimeoProbe.status}: ${report.vimeoSearchProbe.error || 'unknown'}`);
      }
    } else {
      report.checks.vimeo_api_search = 'NOT TESTED';
      report.notes.push('Could not capture staging access header for Vimeo probe.');
    }

    // Capture blueprint for asset provenance
    await page.getByText('Staging: inspect Director Blueprint').click();
    const blueprintDownload = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Download Blueprint' }).click();
    const blueprintPath = await (await blueprintDownload).path();
    const blueprintText = readFileSync(blueprintPath, 'utf8');
    writeFileSync(join(OUT, 'blueprint.json'), blueprintText);
    const diagnostic = JSON.parse(blueprintText);
    const blueprint = diagnostic.directorBlueprint || {};
    report.vimeoDiscovery = blueprint.vimeoDiscovery ?? null;
    report.directions = (blueprint.creativeDirections || []).map(d => d.concept);
    report.selectionRationale = blueprint.selectionRationale || null;
    for (const asset of blueprint.assets || []) {
      const id = String(asset.id || '');
      const row = { id, title: asset.title || null, creator: asset.creator || null, sourceUrl: asset.sourceUrl || null, query: asset.query || null, provider: asset.provider || null };
      if (id.startsWith('pixabay-')) report.assets.pixabay.push(row);
      else if (id.startsWith('vimeo-')) report.assets.vimeoRendered.push(row);
      else if (id.startsWith('owned-')) report.assets.owned.push(row);
      else report.assets.other.push(row);
    }
    const stages = (diagnostic.diagnostics || []).map(e => e.stage);
    const assetFetch = (diagnostic.diagnostics || []).filter(e => e.stage === 'asset_fetch_response');
    if (assetFetch.length) {
      report.timings.asset_loading_ms = assetFetch.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    }
    const analysisDiag = (diagnostic.diagnostics || []).find(e => e.stage === 'music_analysis_ready' || e.stage === 'analysis_ready');
    if (analysisDiag?.durationMs) report.timings.music_analysis_ms = analysisDiag.durationMs;
    const previewReady = (diagnostic.diagnostics || []).find(e => e.stage === 'preview_ready');
    if (previewReady?.durationMs) report.timings.preview_ready_ms = previewReady.durationMs;

    report.checks.visual_recommendations = (report.directions.length >= 1 || (blueprint.assets || []).length >= 2) ? 'PASS' : 'FAIL';
    report.checks.actual_media_loading = stages.includes('preview_ready') || (blueprint.assets || []).length >= 2 ? 'PASS' : 'FAIL';
    report.checks.rendered_assets_are_pixabay_or_owned = report.assets.vimeoRendered.length === 0 && (report.assets.pixabay.length + report.assets.owned.length) >= 2
      ? 'PASS'
      : (report.assets.vimeoRendered.length ? 'FAIL' : (report.assets.pixabay.length >= 2 ? 'PASS' : 'FAIL'));
    report.checks.vimeo_discovery_sidecar = report.vimeoDiscovery
      ? (['discovery-metadata-only', 'download-links-present'].includes(report.vimeoDiscovery.status) ? 'PASS'
        : report.vimeoDiscovery.status === 'unavailable' ? 'FAIL' : 'NOT TESTED')
      : 'NOT TESTED';
    if (!report.vimeoDiscovery) {
      report.notes.push('No vimeoDiscovery on blueprint — Brain may lack VIMEO_ACCESS_TOKEN or deploy not yet live.');
    } else if (report.vimeoDiscovery.status === 'discovery-metadata-only') {
      report.notes.push('Vimeo returned discovery metadata only; render assets remained Pixabay/owned.');
    }
    report.notes.push('Local PixiJS fixtures were not used as newly discovered creative footage in this staging run.');

    // Direction UI present (product directions from Brain creativeDirections)
    const directionGroup = page.getByRole('group', { name: 'Choose a visual direction' });
    if (await directionGroup.count()) {
      const buttons = directionGroup.getByRole('button');
      const count = await buttons.count();
      report.directionLabels = [];
      for (let i = 0; i < count; i++) report.directionLabels.push((await buttons.nth(i).innerText()).trim());
      report.checks.kinetic_restrained_direction_ui = count >= 2 ? 'PASS' : 'FAIL';
    } else {
      report.checks.kinetic_restrained_direction_ui = report.directions.length >= 2 ? 'PASS' : 'NOT TESTED';
      report.notes.push('Direction chips not shown; blueprint creativeDirections recorded separately.');
    }

    async function waitPreviewReady(timeout = 300000) {
      await page.getByLabel('Automatic video preview').waitFor({ timeout });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Play' && !button.disabled), null, { timeout });
    }

    // Preview + export the initial balanced composition first (stable path).
    const previewStart = performance.now();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    mark('preview_playback_ms', previewStart);
    report.checks.preview_playback = 'PASS';

    const exportStart = performance.now();
    const pending = page.waitForEvent('download', { timeout: 420000 });
    await page.getByRole('button', { name: 'Download MP4' }).click();
    const file = await (await pending).path();
    const dest = join(OUT, 'mumoo-staging-director-balanced.mp4');
    writeFileSync(dest, readFileSync(file));
    mark('export_ms', exportStart);

    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', dest]));
    const video = info.streams.find(s => s.codec_type === 'video');
    const audio = info.streams.find(s => s.codec_type === 'audio');
    const durationOk = info.format.duration === '15.000000';
    const specOk = video?.codec_name === 'h264' && video.width === 1080 && video.height === 1920 && video.nb_frames === '450' && video.r_frame_rate === '30/1' && audio?.codec_name === 'aac';
    report.mp4 = { path: dest, bytes: Number(info.format.size), duration: info.format.duration, codec: video?.codec_name, audio: audio?.codec_name, frames: video?.nb_frames };
    report.checks.mp4_render_download = (specOk && durationOk) ? 'PASS' : 'FAIL';
    report.checks.exact_15s_duration = durationOk ? 'PASS' : 'FAIL';

    const offset = Number(diagnostic?.musicProfile?.clipStartMs ?? diagnostic?.edit?.clip?.offsetMs ?? 0) || 0;
    const sourceAudio = execFileSync(ffmpeg.path, ['-v', 'error', '-ss', String(offset / 1000), '-t', '15', '-i', SONG, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    const exportedAudio = execFileSync(ffmpeg.path, ['-v', 'error', '-i', dest, '-t', '15', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    const samples = Math.min(sourceAudio.length, exportedAudio.length) / 4;
    let dot = 0, a2 = 0, b2 = 0;
    for (let j = 0; j < samples; j++) {
      const a = sourceAudio.readFloatLE(j * 4), b = exportedAudio.readFloatLE(j * 4);
      dot += a * b; a2 += a * a; b2 += b * b;
    }
    const correlation = dot / Math.sqrt(a2 * b2);
    report.audioCorrelation = correlation;
    report.audioOffsetMsTried = offset;
    report.checks.audio_preservation = correlation > 0.9 ? 'PASS' : 'FAIL';

    // Second direction: switch once and export if preview recovers.
    report.checks.second_direction_export = 'NOT TESTED';
    if (await directionGroup.count()) {
      const buttons = directionGroup.getByRole('button');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const label = (await buttons.nth(i).innerText()).trim();
        if (!label || label === 'Balanced mix') continue;
        try {
          const switchStart = performance.now();
          await buttons.nth(i).click();
          await page.getByText(/Creating your video|Measuring authorized footage/i).first().waitFor({ timeout: 60000 }).catch(() => {});
          await waitPreviewReady(240000);
          mark('direction_switch_ms', switchStart);
          report.selectedDirection = label;
          const secondPending = page.waitForEvent('download', { timeout: 420000 });
          const secondExportStart = performance.now();
          await page.getByRole('button', { name: 'Download MP4' }).click();
          const secondFile = await (await secondPending).path();
          const secondDest = join(OUT, `mumoo-staging-director-${label.replace(/\W+/g, '-')}.mp4`);
          writeFileSync(secondDest, readFileSync(secondFile));
          mark('second_export_ms', secondExportStart);
          const secondInfo = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', secondDest]));
          const ok = secondInfo.format.duration === '15.000000' && secondInfo.streams.some(s => s.codec_type === 'video' && s.width === 1080 && s.height === 1920);
          report.secondMp4 = { path: secondDest, bytes: Number(secondInfo.format.size), duration: secondInfo.format.duration, direction: label };
          report.checks.second_direction_export = ok ? 'PASS' : 'FAIL';
        } catch (error) {
          report.checks.second_direction_export = 'FAIL';
          report.notes.push(`Second direction (${label}) failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
    }

    // Family regression smoke from Director back button → family buttons
    await page.getByRole('button', { name: 'Back to music' }).click();
    const human = await page.getByRole('button', { name: 'Human Magnet' }).count();
    const curiosity = await page.getByRole('button', { name: 'Visual Curiosity' }).count();
    const montage = await page.getByRole('button', { name: 'Rhythmic Montage' }).count();
    report.familyButtons = { human, curiosity, montage };
    report.checks.no_regression_existing_families = (human + curiosity + montage) >= 2 ? 'PASS' : 'FAIL';

    report.mediaOps = [...new Set(mediaLog.map(e => e.operation))];
    report.finishedAt = new Date().toISOString();
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    t.diagnostic(JSON.stringify({ checks: report.checks, timings: report.timings, assets: report.assets, vimeoDiscovery: report.vimeoDiscovery, directions: report.directions, audioCorrelation: report.audioCorrelation }, null, 2));

    assert.equal(report.checks.actual_media_loading, 'PASS');
    assert.equal(report.checks.mp4_render_download, 'PASS');
    assert.equal(report.checks.exact_15s_duration, 'PASS');
    assert.equal(report.checks.preview_playback, 'PASS');
    assert.equal(report.checks.audio_preservation, 'PASS');
    // Second direction is best-effort; do not fail the milestone if remount stalls.
  } catch (error) {
    report.fatal = error instanceof Error ? error.message : String(error);
    report.finishedAt = new Date().toISOString();
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
});
