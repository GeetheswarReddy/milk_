import type { Photo } from './domain';
export const PHOTO_BUDGET = 30_000_000;
export const PHOTO_MAX_BYTES = 100_000;
export async function compressPhoto(file: Blob): Promise<Photo> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    let scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable.');
    for (let resize = 0; resize < 7; resize++, scale *= 0.8) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65, 0.45, 0.3]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= PHOTO_MAX_BYTES) return { id: crypto.randomUUID(), blob, size: blob.size, uploaded: false };
      }
    }
    throw new Error('This photo could not fit the 100 KB limit. Retake it or explain why a photo is unavailable.');
  } finally { bitmap.close(); }
}
