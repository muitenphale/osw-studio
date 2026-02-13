/**
 * Image compression utility for thumbnail uploads.
 * Loads a File into an Image, draws onto a canvas at max 640×360
 * (maintaining aspect ratio), and exports as JPEG base64.
 */

const MAX_WIDTH = 640;
const MAX_HEIGHT = 360;
const INITIAL_QUALITY = 0.7;
const FALLBACK_QUALITY = 0.5;
const MAX_SIZE_BYTES = 100_000; // 100 KB

export async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  // Calculate output dimensions maintaining aspect ratio
  let width = bitmap.width;
  let height = bitmap.height;

  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // First attempt at normal quality
  let dataUrl = canvas.toDataURL('image/jpeg', INITIAL_QUALITY);

  // If too large, retry at lower quality
  if (dataUrl.length > MAX_SIZE_BYTES * 1.37) {
    // base64 is ~37% larger than raw bytes
    dataUrl = canvas.toDataURL('image/jpeg', FALLBACK_QUALITY);
  }

  return dataUrl;
}
