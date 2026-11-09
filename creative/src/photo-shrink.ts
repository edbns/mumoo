/** Photos are shrunk in the browser to a JPEG of at most this many pixels on the long side, so they are small and quick to send. */
export const LONG_SIDE = 1920;
const JPEG_QUALITY = 0.85;

/** The photo as a JPEG. Transparent areas turn white (a JPEG has no transparency; they would otherwise turn black). */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('That photo could not be read.'); });
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('That photo could not be prepared.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!jpeg) throw new Error('That photo could not be prepared.');
  return jpeg;
}
