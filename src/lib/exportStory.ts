import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';

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
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getThemeColors(theme: string) {
  const themes: Record<string, { bg: string; fg: string; accent: string }> = {
    pink: { bg: '#F9E8ED', fg: '#4A1528', accent: '#D45D7E' },
    mint: { bg: '#E5F5F0', fg: '#0D3B2E', accent: '#45A882' },
    lavender: { bg: '#EDEBF5', fg: '#2A1F45', accent: '#8B6DB5' },
    sky: { bg: '#E5F0F8', fg: '#0D2B3B', accent: '#4A9ED6' },
    peach: { bg: '#F9EDE5', fg: '#3B1F0D', accent: '#D68A4A' },
  };
  return themes[theme] || themes.pink;
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

export async function exportIgStory(journey: Journey) {
  const W = 1080, H = 1920;
  const colors = getThemeColors(journey.theme);
  const completed = journey.challenges.filter(c => c.completed).length;
  const total = journey.challenges.length;

  // Collect photos
  const allPhotoIds = journey.challenges.flatMap(c => c.photoIds);
  const photoDataUrls: string[] = [];
  for (const pid of allPhotoIds.slice(0, 6)) {
    const blob = await getPhoto(pid);
    if (blob) {
      try {
        photoDataUrls.push(await blobToDataUrl(blob));
      } catch { /* skip */ }
    }
  }

  // --- Slide 1: Cover ---
  {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.fillStyle = colors.accent + '25';
    ctx.beginPath(); ctx.arc(200, 350, 180, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(880, 1550, 220, 0, Math.PI * 2); ctx.fill();

    // Mascot
    try {
      const mascotImg = await loadImage('/mascot.svg');
      ctx.drawImage(mascotImg, W / 2 - 120, 450, 240, 240);
    } catch { /* no mascot */ }

    ctx.fillStyle = colors.fg;
    ctx.font = 'bold 64px Nunito, sans-serif';
    ctx.textAlign = 'center';
    const titleLines = wrapText(ctx, journey.title, W - 160);
    titleLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, 820 + i * 80);
    });

    ctx.font = '36px Nunito, sans-serif';
    ctx.fillStyle = colors.accent;
    ctx.fillText(
      `${journey.startDate}${journey.endDate ? ' – ' + journey.endDate : ''}`,
      W / 2, 1050
    );
    if (journey.buddyName) {
      ctx.fillText(`with ${journey.buddyName} 🧸`, W / 2, 1120);
    }

    downloadCanvas(canvas, 'story-cover.png');
  }

  // --- Slide 2: Stats + Collage ---
  {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = colors.fg;
    ctx.font = 'bold 56px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Journey Stats ✨', W / 2, 150);

    // Completion ring
    const cx = W / 2, cy = 400, r = 120;
    ctx.strokeStyle = colors.accent + '30';
    ctx.lineWidth = 24;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = colors.accent;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (total > 0 ? (completed / total) : 0) * Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = colors.fg;
    ctx.font = 'bold 72px Nunito, sans-serif';
    ctx.fillText(`${total > 0 ? Math.round((completed / total) * 100) : 0}%`, cx, cy + 25);
    ctx.font = '32px Nunito, sans-serif';
    ctx.fillText(`${completed} of ${total} completed`, cx, cy + r + 60);

    // Photo collage
    if (photoDataUrls.length > 0) {
      const startY = 700;
      const cols = Math.min(photoDataUrls.length, 3);
      const size = Math.floor((W - 160) / cols - 20);
      for (let i = 0; i < Math.min(photoDataUrls.length, 6); i++) {
        try {
          const img = await loadImage(photoDataUrls[i]);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = 80 + col * (size + 20);
          const y = startY + row * (size + 20);
          ctx.save();
          roundRect(ctx, x, y, size, size, 20);
          ctx.clip();
          const scale = Math.max(size / img.width, size / img.height);
          const sw = img.width * scale, sh = img.height * scale;
          ctx.drawImage(img, x - (sw - size) / 2, y - (sh - size) / 2, sw, sh);
          ctx.restore();
        } catch { /* skip */ }
      }
    }

    downloadCanvas(canvas, 'story-stats.png');
  }

  // --- Slide 3: Top Moments ---
  {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = colors.fg;
    ctx.font = 'bold 56px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Top Moments 🌟', W / 2, 150);

    const completedChallenges = journey.challenges.filter(c => c.completed).slice(0, 6);
    let y = 300;
    ctx.textAlign = 'left';
    for (const c of completedChallenges) {
      ctx.fillStyle = colors.accent;
      ctx.font = 'bold 40px Nunito, sans-serif';
      ctx.fillText('✅', 80, y);
      ctx.fillStyle = colors.fg;
      ctx.font = '36px Nunito, sans-serif';
      ctx.fillText(c.title, 150, y);
      if (c.caption) {
        ctx.font = '28px Nunito, sans-serif';
        ctx.fillStyle = colors.fg + 'AA';
        const cap = c.caption.length > 45 ? c.caption.slice(0, 45) + '…' : c.caption;
        ctx.fillText(cap, 150, y + 45);
        y += 50;
      }
      y += 90;
    }

    if (completedChallenges.length === 0) {
      ctx.textAlign = 'center';
      ctx.font = '36px Nunito, sans-serif';
      ctx.fillStyle = colors.fg + '88';
      ctx.fillText('Complete challenges to see them here!', W / 2, H / 2);
    }

    downloadCanvas(canvas, 'story-moments.png');
  }
}
