import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';
import { drawImageCover } from './imageUtils';

function stripCheckboxPrefix(title: string): string {
  return title.replace(/^\s*\[(x|X| )\]\s*/u, '');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  // Always export a true 1080x1920 PNG; callers are responsible for
  // providing a canvas with the desired intrinsic resolution.
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

type StoryPalette = {
  bg: string;
  blobs: string[];
  accent: string;
  labelBg: string;
  labelText: string;
  dark: string;
};

function getStoryPalette(theme: string): StoryPalette {
  const base: Record<string, StoryPalette> = {
    pink: {
      bg: '#FFE8F0',
      blobs: ['#FFB3C6', '#FCE1FF', '#FFE5B4'],
      accent: '#FF4B91',
      labelBg: '#FFFFFF',
      labelText: '#40202E',
      dark: '#262334',
    },
    mint: {
      bg: '#E3FFF4',
      blobs: ['#9BF3C8', '#C8F5FF', '#FFF6B3'],
      accent: '#00B894',
      labelBg: '#FFFFFF',
      labelText: '#093327',
      dark: '#12302A',
    },
    lavender: {
      bg: '#F2ECFF',
      blobs: ['#CBB2FF', '#FFE5FF', '#FFE8C2'],
      accent: '#9B5DE5',
      labelBg: '#FFFFFF',
      labelText: '#2C2147',
      dark: '#241B3A',
    },
    sky: {
      bg: '#E6F4FF',
      blobs: ['#A5D8FF', '#FFDEEB', '#FFE066'],
      accent: '#228BE6',
      labelBg: '#FFFFFF',
      labelText: '#0B2940',
      dark: '#052136',
    },
    peach: {
      bg: '#FFF1E6',
      blobs: ['#FFC9A9', '#FFD6E0', '#FFF6C2'],
      accent: '#FF6B6B',
      labelBg: '#FFFFFF',
      labelText: '#402015',
      dark: '#331A10',
    },
  };
  return base[theme] || base.pink;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBlobBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  palette: StoryPalette,
) {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // Large rounded blocks / blobs
  ctx.save();
  ctx.fillStyle = palette.blobs[0];
  roundRect(ctx, -40, 120, W * 0.7, 260, 80);
  ctx.fill();

  ctx.fillStyle = palette.blobs[1];
  roundRect(ctx, W * 0.35, H * 0.55, W * 0.75, 260, 120);
  ctx.fill();

  ctx.fillStyle = palette.blobs[2];
  ctx.beginPath();
  ctx.ellipse(W * 0.15, H * 0.8, 180, 140, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawStickerLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  paddingX: number,
  paddingY: number,
  palette: StoryPalette,
  options: { accent?: boolean; smallCaps?: boolean } = {},
) {
  const labelText = options.smallCaps ? text.toUpperCase() : text;
  ctx.save();
  ctx.font = '700 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const textWidth = ctx.measureText(labelText).width;
  const w = textWidth + paddingX * 2;
  const h = 34 + paddingY * 2;
  const r = 18;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  roundRect(ctx, x + 4, y + 6, w, h, r);
  ctx.fill();

  // Label background
  ctx.fillStyle = options.accent ? palette.accent : palette.labelBg;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Text
  ctx.fillStyle = options.accent ? '#FFFFFF' : palette.labelText;
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, x + paddingX, y + h / 2);
  ctx.restore();
}

function drawDoodles(ctx: CanvasRenderingContext2D, W: number, H: number, palette: StoryPalette) {
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // Corner doodle lines
  ctx.beginPath();
  ctx.moveTo(40, 80);
  ctx.lineTo(80, 70);
  ctx.lineTo(110, 90);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(W - 140, H - 140);
  ctx.lineTo(W - 80, H - 150);
  ctx.lineTo(W - 40, H - 130);
  ctx.stroke();

  // Sparkles
  const sparkles = [
    { x: W * 0.2, y: H * 0.3 },
    { x: W * 0.8, y: H * 0.25 },
    { x: W * 0.5, y: H * 0.75 },
  ];
  ctx.fillStyle = palette.labelBg;
  sparkles.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.fillStyle = palette.labelBg;
  });

  // Dotted path
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = palette.dark + '55';
  ctx.beginPath();
  ctx.moveTo(W * 0.1, H * 0.55);
  ctx.quadraticCurveTo(W * 0.3, H * 0.45, W * 0.5, H * 0.6);
  ctx.quadraticCurveTo(W * 0.7, H * 0.75, W * 0.9, H * 0.7);
  ctx.stroke();

  ctx.restore();
}

function drawPolaroidPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationRad: number,
  palette: StoryPalette,
  caption?: string,
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotationRad);

  const frameW = w;
  const frameH = h;
  const photoPadding = 16;
  const topPadding = 16;
  const bottomPadding = caption ? 44 : 24;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, -frameW / 2 + 8, -frameH / 2 + 10, frameW, frameH, 28);
  ctx.fill();

  // White polaroid frame
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, -frameW / 2, -frameH / 2, frameW, frameH, 28);
  ctx.fill();

  const innerX = -frameW / 2 + photoPadding;
  const innerY = -frameH / 2 + topPadding;
  const innerW = frameW - photoPadding * 2;
  const innerH = frameH - topPadding - bottomPadding;

  // Photo area (rounded)
  ctx.save();
  roundRect(ctx, innerX, innerY, innerW, innerH, 20);
  ctx.clip();
  drawImageCover(ctx, img, innerX, innerY, innerW, innerH);
  ctx.restore();

  // Caption label (optional)
  if (caption) {
    ctx.font = '600 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const cap = caption.length > 26 ? `${caption.slice(0, 24)}…` : caption;
    const textWidth = ctx.measureText(cap).width;
    const labelPaddingX = 12;
    const labelW = textWidth + labelPaddingX * 2;
    const labelH = 26;
    const labelX = -labelW / 2;
    const labelY = innerY + innerH + 10;

    ctx.fillStyle = palette.labelBg;
    roundRect(ctx, labelX, labelY, labelW, labelH, 14);
    ctx.fill();

    ctx.fillStyle = palette.labelText;
    ctx.textBaseline = 'middle';
    ctx.fillText(cap, labelX + labelPaddingX, labelY + labelH / 2);
  }

  ctx.restore();
}

export async function exportIgStory(journey: Journey) {
  const W = 1080;
  const H = 1920;
  // Use devicePixelRatio (or a floor of 2) for crisper text/graphics,
  // then downscale to 1080x1920 for the final exported PNG.
  const DPR = typeof window !== 'undefined' && window.devicePixelRatio
    ? Math.max(1, Math.min(window.devicePixelRatio, 3))
    : 2;

  const palette = getStoryPalette(journey.theme);
  const completedChallenges = journey.challenges.filter(c => c.completed);
  const completed = completedChallenges.length;
  const total = journey.challenges.length;

  // IG Story: curated subset – first 6 photos from completed challenges
  const allPhotoIds = completedChallenges.flatMap(c => c.photoIds);
  const photoDataUrls: string[] = [];
  for (const pid of allPhotoIds.slice(0, 6)) {
    const blob = await getPhoto(pid);
    if (blob) {
      try {
        photoDataUrls.push(await blobToDataUrl(blob));
      } catch { /* skip */ }
    }
  }

  const SAFE_X = 80;
  const SAFE_TOP = 120;
  const SAFE_BOTTOM = 160;

  // --- Slide 1: Cover ---
  {
    // High-DPI working canvas
    const workCanvas = document.createElement('canvas');
    workCanvas.width = W * DPR;
    workCanvas.height = H * DPR;
    const ctx = workCanvas.getContext('2d')!;
    ctx.scale(DPR, DPR);
    ctx.textAlign = 'left';

    drawBlobBackground(ctx, W, H, palette);
    drawDoodles(ctx, W, H, palette);

    // Headline label strips for title
    ctx.font = '900 52px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = palette.labelText;
    const titleLines = wrapText(ctx, journey.title || 'Taipei Journey', W - SAFE_X * 2);
    let titleY = SAFE_TOP + 40;
    titleLines.slice(0, 3).forEach(line => {
      const text = line.toUpperCase();
      const textWidth = ctx.measureText(text).width;
      const paddingX = 18;
      const paddingY = 10;
      const labelX = (W - textWidth) / 2 - paddingX;
      const labelY = titleY - 30;
      drawStickerLabel(
        ctx,
        text,
        labelX,
        labelY,
        paddingX,
        paddingY,
        palette,
      );
      titleY += 64;
    });

    // Date range as small caps label
    const dateText = `${journey.startDate}${journey.endDate ? ' – ' + journey.endDate : ''}`;
    if (dateText.trim()) {
      ctx.font = '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const upper = dateText.toUpperCase();
      const tw = ctx.measureText(upper).width;
      const labelX = (W - tw) / 2 - 18;
      const labelY = titleY + 10;
      drawStickerLabel(
        ctx,
        upper,
        labelX,
        labelY,
        18,
        6,
        palette,
        { smallCaps: true },
      );
    }

    // Hero photo in polaroid frame
    if (photoDataUrls[0]) {
      try {
        const img = await loadImage(photoDataUrls[0]);
        const frameW = 520;
        const frameH = 640;
        const x = (W - frameW) / 2;
        const y = H / 2 - frameH / 2 + 40;
        drawPolaroidPhoto(
          ctx,
          img,
          x,
          y,
          frameW,
          frameH,
          -0.04,
          palette,
          journey.buddyName ? `with ${journey.buddyName}` : undefined,
        );
      } catch {
        // ignore if photo fails
      }
    }

    // Cute stamp
    const stampText = journey.title.toLowerCase().includes('taipei') ? 'IN TAIPEI' : 'NEW POST!';
    drawStickerLabel(
      ctx,
      stampText,
      SAFE_X,
      H - SAFE_BOTTOM - 40,
      16,
      6,
      palette,
      { accent: true, smallCaps: true },
    );

    // Downscale to a true 1080x1920 export canvas.
    const outCanvas = document.createElement('canvas');
    outCanvas.width = W;
    outCanvas.height = H;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.drawImage(workCanvas, 0, 0, outCanvas.width, outCanvas.height);

    downloadCanvas(outCanvas, 'story-cover.png');
  }

  // --- Slide 2: Stats + Collage ---
  {
    const workCanvas = document.createElement('canvas');
    workCanvas.width = W * DPR;
    workCanvas.height = H * DPR;
    const ctx = workCanvas.getContext('2d')!;
    ctx.scale(DPR, DPR);
    ctx.textAlign = 'left';

    drawBlobBackground(ctx, W, H, palette);
    drawDoodles(ctx, W, H, palette);

    // Header label
    ctx.font = '800 40px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawStickerLabel(
      ctx,
      'JOURNEY STATS',
      SAFE_X,
      SAFE_TOP,
      18,
      6,
      palette,
      { smallCaps: true },
    );

    // Big percent badge
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    ctx.font = '900 90px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const percentText = `${percent}%`;
    const ptw = ctx.measureText(percentText).width;
    const badgeW = ptw + 80;
    const badgeH = 130;
    const badgeX = (W - badgeW) / 2;
    const badgeY = SAFE_TOP + 90;

    // Badge shadow + card
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(ctx, badgeX + 10, badgeY + 16, badgeW, badgeH, 36);
    ctx.fill();
    ctx.fillStyle = palette.labelBg;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 36);
    ctx.fill();

    ctx.fillStyle = palette.dark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(percentText, W / 2, badgeY + badgeH / 2 - 10);

    ctx.font = '600 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = palette.labelText + 'CC';
    ctx.fillText(
      `${completed} / ${total} CHECKS`,
      W / 2,
      badgeY + badgeH / 2 + 40,
    );

    // 4-photo collage (2x2) with mixed frames
    const collageTop = badgeY + badgeH + 80;
    const frameSize = 260;
    const gap = 36;
    const startX = (W - (frameSize * 2 + gap)) / 2;

    const maxCollagePhotos = Math.min(photoDataUrls.length, 4);
    for (let i = 0; i < maxCollagePhotos; i++) {
      try {
        const img = await loadImage(photoDataUrls[i]);
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = startX + col * (frameSize + gap);
        const y = collageTop + row * (frameSize + gap);

        if (i % 2 === 0) {
          // Polaroid style
          drawPolaroidPhoto(
            ctx,
            img,
            x,
            y,
            frameSize,
            frameSize + 80,
            i === 0 ? -0.06 : 0.05,
            palette,
          );
        } else {
          // Rounded card frame
          ctx.save();
          ctx.translate(x + frameSize / 2, y + frameSize / 2);
          ctx.rotate(i === 1 ? 0.04 : -0.03);

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          roundRect(ctx, -frameSize / 2 + 8, -frameSize / 2 + 12, frameSize, frameSize, 32);
          ctx.fill();

          // Card
          ctx.fillStyle = palette.labelBg;
          roundRect(ctx, -frameSize / 2, -frameSize / 2, frameSize, frameSize, 32);
          ctx.fill();

          const inner = 20;
          ctx.save();
          roundRect(
            ctx,
            -frameSize / 2 + inner,
            -frameSize / 2 + inner,
            frameSize - inner * 2,
            frameSize - inner * 2,
            26,
          );
          ctx.clip();
          drawImageCover(
            ctx,
            img,
            -frameSize / 2 + inner,
            -frameSize / 2 + inner,
            frameSize - inner * 2,
            frameSize - inner * 2,
          );
          ctx.restore();
          ctx.restore();
        }
      } catch {
        // skip bad image
      }
    }

    // Stamp
    drawStickerLabel(
      ctx,
      'CHECK!',
      SAFE_X,
      H - SAFE_BOTTOM - 32,
      18,
      6,
      palette,
      { accent: true, smallCaps: true },
    );

    const outCanvas = document.createElement('canvas');
    outCanvas.width = W;
    outCanvas.height = H;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.drawImage(workCanvas, 0, 0, outCanvas.width, outCanvas.height);

    downloadCanvas(outCanvas, 'story-stats.png');
  }

  // --- Slide 3: Top Moments ---
  {
    const workCanvas = document.createElement('canvas');
    workCanvas.width = W * DPR;
    workCanvas.height = H * DPR;
    const ctx = workCanvas.getContext('2d')!;
    ctx.scale(DPR, DPR);
    ctx.textAlign = 'left';

    drawBlobBackground(ctx, W, H, palette);
    drawDoodles(ctx, W, H, palette);

    // Header
    ctx.font = '800 40px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawStickerLabel(
      ctx,
      'TOP MOMENTS',
      SAFE_X,
      SAFE_TOP,
      18,
      6,
      palette,
      { smallCaps: true },
    );

    const topCompleted = completedChallenges.slice(0, 3);
    const stackCenterX = W / 2;
    const baseY = SAFE_TOP + 120;
    const polaroidW = 420;
    const polaroidH = 520;

    // Stack 2–3 polaroids with slight rotations
    for (let i = 0; i < topCompleted.length; i++) {
      const c = topCompleted[i];
      const angle = i === 0 ? -0.09 : i === 1 ? 0.06 : -0.03;
      const offsetX = i === 0 ? -120 : i === 1 ? 80 : -40;
      const offsetY = i === 2 ? 90 : i * 40;

      const photoId = c.photoIds[0];
      if (!photoId) continue;

      try {
        const blob = await getPhoto(photoId);
        if (!blob) continue;
        const url = await blobToDataUrl(blob);
        const img = await loadImage(url);

        const x = stackCenterX + offsetX - polaroidW / 2;
        const y = baseY + offsetY;
        const caption = stripCheckboxPrefix(c.title);
        drawPolaroidPhoto(
          ctx,
          img,
          x,
          y,
          polaroidW,
          polaroidH,
          angle,
          palette,
          caption,
        );
      } catch {
        // skip if photo fails
      }
    }

    // Doodle arrows pointing to center area
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(SAFE_X + 10, H * 0.55);
    ctx.quadraticCurveTo(W * 0.25, H * 0.5, W * 0.4, H * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - SAFE_X - 10, H * 0.45);
    ctx.quadraticCurveTo(W * 0.75, H * 0.5, W * 0.6, H * 0.55);
    ctx.stroke();
    ctx.restore();

    // Footer handle / tag
    ctx.textAlign = 'center';
    drawStickerLabel(
      ctx,
      '@CUTE_JOURNEY',
      W / 2 - 120,
      H - SAFE_BOTTOM,
      18,
      6,
      palette,
      { smallCaps: true },
    );

    if (completedChallenges.length === 0) {
      ctx.textAlign = 'center';
      ctx.font = '600 30px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = palette.labelText + 'CC';
      ctx.fillText(
        'Complete challenges to see your cutest moments here!',
        W / 2,
        H / 2,
      );
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = W;
    outCanvas.height = H;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.drawImage(workCanvas, 0, 0, outCanvas.width, outCanvas.height);

    downloadCanvas(outCanvas, 'story-moments.png');
  }
}
