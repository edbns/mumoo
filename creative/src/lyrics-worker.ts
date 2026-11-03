import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;

self.onmessage = async ({ data }: MessageEvent<Float32Array>) => {
  try {
    self.postMessage({ status: 'Loading the speech model…' });
    const transcribe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      device: 'wasm', dtype: 'q8',
    });
    self.postMessage({ status: 'Listening for words in your clip…' });
    const response = await transcribe(data, { return_timestamps: 'word' });
    const result = Array.isArray(response) ? response[0] : response;
    self.postMessage({ words: result.chunks ?? [] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The speech model could not run.' });
  }
};
