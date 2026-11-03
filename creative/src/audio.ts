export async function decodeWav(bytes: ArrayBuffer) {
  const header = new DataView(bytes);
  if (header.byteLength < 12 || header.getUint32(0) !== 0x52494646 ||
      header.getUint32(8) !== 0x57415645 || header.getUint32(4, true) + 8 > bytes.byteLength) {
    throw new Error('Choose a valid RIFF WAV file.');
  }
  const context = new OfflineAudioContext(1, 1, 48_000);
  try {
    return await context.decodeAudioData(bytes);
  } catch {
    throw new Error('This WAV could not be decoded.');
  }
}

export async function hashWav(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
