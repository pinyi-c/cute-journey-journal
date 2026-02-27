export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;

  if (imgRatio > boxRatio) {
    // Image is wider than the box: crop left/right
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    // Image is taller than the box: crop top/bottom
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawCoverCropToCanvas(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  scale: number,
): string {
  const targetRatio = targetW / targetH;
  const sourceRatio = img.width / img.height;

  let sx: number;
  let sy: number;
  let sWidth: number;
  let sHeight: number;

  if (sourceRatio > targetRatio) {
    sHeight = img.height;
    sWidth = sHeight * targetRatio;
    sx = (img.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = img.width;
    sHeight = sWidth / targetRatio;
    sx = 0;
    sy = (img.height - sHeight) / 2;
  }

  const outW = Math.max(1, Math.round(targetW * scale));
  const outH = Math.max(1, Math.round(targetH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Cover-crop source image to target aspect ratio (object-fit: cover).
 * Never stretches; centers crop by default. Returns JPEG data URL for PDF.
 */
export async function cropImageToDataURL(
  sourceDataURL: string,
  targetW: number,
  targetH: number,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = sourceDataURL;
  });

  if (typeof img.decode === 'function') {
    await img.decode();
  }

  try {
    return drawCoverCropToCanvas(img, targetW, targetH, 4);
  } catch (e) {
    try {
      return drawCoverCropToCanvas(img, targetW, targetH, 1);
    } catch {
      throw e;
    }
  }
}

