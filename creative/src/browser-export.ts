import { AudioBufferSource, BufferTarget, CanvasSource, EncodedAudioPacketSource, NullTarget, Mp4OutputFormat, Output, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import { DURATION_MS, FPS, FRAMES, HEIGHT, WIDTH, lyricText, lyricsFor, validate, type Composition } from './composition';
import { draw, loadFont } from './render';
import { paintDailyScreen } from './daily-screens-paint';

async function defaultRenderFrame(canvas: HTMLCanvasElement, composition: Composition, frame: number) {
  if (composition.template === 'daily-screens') {
    await paintDailyScreen(
      canvas,
      lyricsFor(composition),
      frame,
      composition.dailyScreen ?? { variant: 'messages', capturedAtMs: 0 },
    );
    return;
  }
  draw(canvas, composition, frame);
}

export async function renderMp4(composition: Composition, audio: AudioBuffer, progress: (frame: number) => void, renderFrame: (canvas: HTMLCanvasElement, frame: number) => void | Promise<void> = (canvas, frame) => defaultRenderFrame(canvas, composition, frame), measure?: (stage: string, ms: number) => void) {
  const initStart = performance.now();
  validate(composition, audio.duration * 1000);
  const videoConfig = { codec: 'avc', bitrate: 5_000_000 } as const;
  const audioConfig = { codec: 'aac', bitrate: 192_000 } as const;
  const [videoSupported, audioSupported] = await Promise.all([
    canEncodeVideo(videoConfig.codec, { width: WIDTH, height: HEIGHT, bitrate: videoConfig.bitrate }),
    canEncodeAudio(audioConfig.codec, { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, bitrate: audioConfig.bitrate }),
  ]);
  if (!videoSupported || !audioSupported) {
    throw new Error('This browser cannot encode H.264 and AAC on this device. Try an up-to-date browser with MP4 encoding support.');
  }
  await loadFont(lyricText(composition));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const firstSample = Math.round(composition.clipStartMs * audio.sampleRate / 1000);
  const clip = new AudioBuffer({
    length: DURATION_MS * audio.sampleRate / 1000,
    numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate,
  });
  for (let channel = 0; channel < clip.numberOfChannels; channel++) {
    clip.getChannelData(channel).set(audio.getChannelData(channel).subarray(firstSample, firstSample + clip.length));
  }
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, videoConfig);
  const music = new EncodedAudioPacketSource('aac');
  const duration = DURATION_MS / 1000;
  let packets = Promise.resolve();
  // Keep the encoder's priming timestamps, but cap AAC padding at the clip end.
  const encoder = new AudioBufferSource({
    ...audioConfig,
    onEncodedPacket(packet, metadata) {
      if (packet.timestamp >= duration) return;
      const trimmed = packet.clone({ duration: Math.min(packet.duration, duration - packet.timestamp) });
      packets = packets.then(() => music.add(trimmed, metadata));
      void packets.catch(() => {});
    },
  });
  const audioOutput = new Output({ format: new Mp4OutputFormat(), target: new NullTarget() });
  audioOutput.addAudioTrack(encoder);
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(music);
  try {
    await output.start();
    measure?.('initialization', performance.now() - initStart);
    const audioTask = (async () => {
      const start = performance.now();
      await audioOutput.start();
      await encoder.add(clip);
      encoder.close();
      await audioOutput.finalize();
      await packets;
      music.close();
      measure?.('audio_pipeline', performance.now() - start);
    })();
    const videoTask = (async () => {
      for (let frame = 0; frame < FRAMES; frame++) {
        const renderStart = performance.now();
        await renderFrame(canvas, frame);
        measure?.('frame_render', performance.now() - renderStart);
        const encodeStart = performance.now();
        await video.add(frame / FPS, 1 / FPS);
        measure?.('video_add', performance.now() - encodeStart);
        progress(frame + 1);
        if (frame % 12 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      video.close();
    })();
    await Promise.all([audioTask, videoTask]);
    const finalizeStart = performance.now();
    await output.finalize();
    measure?.('mux_finalize', performance.now() - finalizeStart);
    if (!target.buffer) throw new Error('The encoder did not produce a video.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    await Promise.allSettled([output.cancel(), audioOutput.cancel()]);
    throw error;
  }
}
