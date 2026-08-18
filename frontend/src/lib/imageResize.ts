// Promo pictures are chosen from a phone or a camera roll and are routinely
// 5-8 MB — far more than a login screen needs, and larger than the request body
// cap would accept. Shrink and re-encode before upload so what leaves the
// browser is a sensible size.

const MAX_EDGE = 1920;
const QUALITY = 0.82;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as a picture.'));
    img.src = src;
  });
}

/** Returns a JPEG data URL, scaled so its longest edge is at most 1920px. */
export async function downscaleImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process pictures.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rough byte size of a base64 data URL, for showing the user what they're uploading. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.round((base64.length * 3) / 4);
}
