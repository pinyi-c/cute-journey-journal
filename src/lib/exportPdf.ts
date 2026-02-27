import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';
import { cropImageToDataURL } from './imageUtils';

// We embed Noto Sans TC as a Unicode (Identity-H) font for zh/ja.
const FONT_FILE_TC = 'NotoSansTC-Regular.ttf';
const FONT_NAME_TC = 'NotoSansTC';

function sanitizeForPDF(text: string) {
  return (text || '')
    .replace(/\u2022/g, '-') // bullet • -> -
    .replace(/[\u0000-\u001F\u007F]/g, '') // remove control chars
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // strip emojis (best-effort)
    .trim();
}

function safeTitleForPDF(text: string): string {
  // Keep existing title-specific cleanup, then run generic sanitizer.
  const withoutCheckbox = text.replace(/^\s*\[(x|X| )\]\s*/u, '');
  return sanitizeForPDF(withoutCheckbox);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type JourneyChallenge = Journey['challenges'][number];

type DateGroup = {
  key: string;
  label: string;
  challenges: JourneyChallenge[];
};

function groupByDate(challenges: JourneyChallenge[], journey: Journey): DateGroup[] {
  const map = new Map<string, DateGroup>();

  for (const c of challenges) {
    const key = c.date || journey.startDate || 'unknown';
    let label: string;
    if (key === 'unknown') {
      label = 'Unknown date';
    } else {
      try {
        const d = new Date(key);
        // zh-TW diary-style formatting
        label = new Intl.DateTimeFormat('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      } catch {
        label = key;
      }
    }

    const existing = map.get(key);
    if (existing) {
      existing.challenges.push(c);
    } else {
      map.set(key, { key, label, challenges: [c] });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function estimateBlockHeight(
  doc: any,
  challenge: JourneyChallenge,
  pageWidth: number,
  margin: number,
): number {
  let h = 0;

  // Title line
  h += 10;

  // Caption lines
  if (challenge.caption) {
    const maxWidth = pageWidth - 2 * margin;
    const cap = sanitizeForPDF(challenge.caption);
    const lines = doc.splitTextToSize(cap, maxWidth) as string[];
    h += 2; // spacing before caption
    h += lines.length * 6;
  }

  // Photos (up to 3) – single row of 3 squares is roughly 60mm tall
  const photoCount = Math.min(challenge.photoIds.length, 3);
  if (photoCount > 0) {
    h += 60;
  }

  // Spacing after block
  h += 6;

  return h;
}

function ensureSpace(
  doc: any,
  requiredHeight: number,
  marginTop: number,
  marginBottom: number,
  currentY: number,
): boolean {
  const pageHeight = doc.internal.pageSize.getHeight();
  return currentY + requiredHeight > pageHeight - marginBottom;
}

async function createRoundedImageDataUrl(
  sourceDataUrl: string,
  targetW: number,
  targetH: number,
  radius: number,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = sourceDataUrl;
  });

  const scale = 4; // oversample for smoother edges
  const canvas = document.createElement('canvas');
  canvas.width = targetW * scale;
  canvas.height = targetH * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  const r = radius * scale;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();

  // cover behavior
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;
  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  return canvas.toDataURL('image/png');
}

export async function exportPdf(journey: Journey) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Load a CJK font so English / Chinese / Japanese render correctly.
  // We embed NotoSansTC-Regular.ttf as an Identity-H Unicode font.
  let fontLoaded = false;
  let activeFontName: string | null = null;
  const tryLoadFont = async (url: string, fileName: string, fontName: string) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Failed to load PDF font "${url}": HTTP ${resp.status}`);
        return;
      }
      const buffer = await resp.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      doc.addFileToVFS(fileName, base64);
      // Register TTF with Identity-H so CJK text uses Unicode, not WinAnsi.
      doc.addFont(fileName, fontName, 'normal', 'Identity-H');
      doc.setFont(fontName, 'normal');
      fontLoaded = true;
      activeFontName = fontName;
    } catch (e) {
      console.error(`Error while fetching PDF font "${url}":`, e);
    }
  };

  // These files should be placed under /public/fonts/
  await tryLoadFont('/fonts/NotoSansTC-Regular.ttf', FONT_FILE_TC, FONT_NAME_TC);

  if (!fontLoaded || !activeFontName) {
    console.error(
      'PDF export: failed to load NotoSansTC-Regular.ttf from /public/fonts. ' +
      'Place the TTF at public/fonts/NotoSansTC-Regular.ttf so CJK text can render.'
    );
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Light paper-like background for all pages
  doc.setFillColor(250, 247, 242);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let y = 32;

  // Cover page
  // Always ensure our embedded CJK font is active before any text.
  if (activeFontName) {
    doc.setFont(activeFontName, 'normal');
  }
  // Big title only
  doc.setTextColor(40);
  doc.setFontSize(24);
  doc.text(safeTitleForPDF(journey.title), pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Date line under title
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(
    `${journey.startDate}${journey.endDate ? ' – ' + journey.endDate : ''}`,
    pageWidth / 2,
    y,
    { align: 'center' },
  );
  y += 12;
  if (journey.buddyName) {
    doc.setFontSize(10);
    doc.text(`with ${journey.buddyName}`, pageWidth / 2, y, { align: 'center' });
    y += 8;
  }
  y += 10;

  // Tagline
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    'Three days in Taipei, forever in the camera roll.',
    pageWidth / 2,
    y,
    { align: 'center' },
  );
  y += 16;

  // Challenge pages (only export completed challenges, grouped diary-style by date)
  const completedChallenges = journey.challenges.filter(c => c.completed);
  const groups = groupByDate(completedChallenges, journey);
  const marginTop = 25;
  const marginBottom = 20;

  for (const group of groups) {
    let isFirstPageForGroup = true;

    if (group.challenges.length === 0) continue;

    doc.addPage();
    if (activeFontName) {
      doc.setFont(activeFontName, 'normal');
    }
    doc.setFillColor(250, 247, 242);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    y = marginTop;
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text(group.label, margin, y);
    y += 4;
    // thin divider
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    for (const challenge of group.challenges) {
      const blockHeight = estimateBlockHeight(doc, challenge, pageWidth, margin);

      if (!isFirstPageForGroup && ensureSpace(doc, blockHeight, marginTop, marginBottom, y)) {
        doc.addPage();
        if (activeFontName) {
          doc.setFont(activeFontName, 'normal');
        }
        doc.setFillColor(250, 247, 242);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        y = marginTop;
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`${group.label} (cont.)`, margin, y);
        y += 6;
      } else if (isFirstPageForGroup && ensureSpace(doc, blockHeight, marginTop, marginBottom, y)) {
        // Extremely full first page: start fresh with "(cont.)"
        doc.addPage();
        if (activeFontName) {
          doc.setFont(activeFontName, 'normal');
        }
        doc.setFillColor(250, 247, 242);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        y = marginTop;
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`${group.label} (cont.)`, margin, y);
        y += 6;
      }

      isFirstPageForGroup = false;

      // Title
      doc.setFontSize(13);
      if (activeFontName) {
        doc.setFont(activeFontName, 'normal');
      }
      doc.setTextColor(40);
      doc.text(safeTitleForPDF(challenge.title), margin, y);
      y += 6;

      // Small metadata line (date / location)
      doc.setFontSize(8);
      doc.setTextColor(120);
      const metaParts: string[] = [];
      if (challenge.date) metaParts.push(challenge.date);
      if (challenge.location) metaParts.push(challenge.location);
      if (metaParts.length > 0) {
        doc.text(metaParts.join(' • '), margin, y);
        y += 6;
      } else {
        y += 2;
      }

      // Caption (italic-like: smaller + quotes)
      if (challenge.caption) {
        doc.setFontSize(11);
        const cap = sanitizeForPDF(challenge.caption);
        // Ensure the embedded CJK font is active before caption text.
        if (activeFontName) {
          doc.setFont(activeFontName, 'normal');
        }
        const currentFont = doc.getFont();
        if (currentFont.fontName !== FONT_NAME_TC) {
          console.warn(
            `PDF export: active font before caption is "${currentFont.fontName}", expected "${FONT_NAME_TC}".`
          );
        }
        doc.setTextColor(90);
        const quoted = `“${cap}”`;
        const lines = doc.splitTextToSize(quoted, pageWidth - 2 * margin);
        y += 2;
        doc.text(lines, margin, y);
        y += (lines as string[]).length * 6;
      }

      // Photos (up to 3, in a left-aligned horizontal strip)
      const photoIds = challenge.photoIds.slice(0, 3);
      if (photoIds.length > 0) {
        const photoSize = 40;
        const gap = 5;

        // Thin divider above the photo block for visual separation
        doc.setDrawColor(210);
        doc.setLineWidth(0.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;

        let x = margin;
        for (const pid of photoIds) {
          const blob = await getPhoto(pid);
          if (blob) {
            try {
              const originalDataUrl = await blobToDataUrl(blob);
              const format = originalDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
              doc.addImage(originalDataUrl, format, x, y, photoSize, photoSize);
            } catch (e) {
              console.error('PDF photo render failed', pid, e);
            }
          }
          x += photoSize + gap;
        }

        y += photoSize + 8;
      }

      // Spacing before next challenge
      y += 6;
    }
  }

  const safeName = sanitizeForPDF(journey.title || 'journey') || 'journey';
  doc.save(`${safeName}.pdf`);
}
