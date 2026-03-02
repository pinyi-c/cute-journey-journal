import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';
import { cropImageToDataURL } from './imageUtils';
// We embed Noto Sans TC as a Unicode (Identity-H) font for zh/ja.
const FONT_FILE_TC = 'NotoSansTC-Regular.ttf';
const FONT_NAME_TC = 'NotoSansTC';

// A4 landscape: one physical page = two columns (left/right). Center fold: content kept away from center (no line drawn).
const A4_W_MM = 297;
const A4_H_MM = 210;
const HALF_W_MM = 148.5;
const PAGE_H_MM = 210;

/** Add font to a jsPDF instance. */
function addFontToDoc(doc: any, fontBase64: string | null): string | null {
  if (!fontBase64) return null;
  try {
    doc.addFileToVFS(FONT_FILE_TC, fontBase64);
    doc.addFont(FONT_FILE_TC, FONT_NAME_TC, 'normal', 'Identity-H');
    doc.setFont(FONT_NAME_TC, 'normal');
    return FONT_NAME_TC;
  } catch {
    return null;
  }
}

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

// Cache cropped image data URLs per photo + target size to avoid
// re-encoding the same image multiple times during a single export.
const photoCropCache = new Map<string, string>();
const PDF_PHOTO_PIXEL_SIZE = 1600; // high-res square crop for PDF thumbnails

async function getCachedCroppedSquareForPdf(
  photoId: string,
  originalDataUrl: string,
): Promise<string> {
  const key = `${photoId}-${PDF_PHOTO_PIXEL_SIZE}`;
  const cached = photoCropCache.get(key);
  if (cached) return cached;

  // Use a high-resolution square crop; jsPDF will render it at a fixed
  // physical size (mm) so higher pixel density improves print quality.
  const cropped = await cropImageToDataURL(
    originalDataUrl,
    PDF_PHOTO_PIXEL_SIZE,
    PDF_PHOTO_PIXEL_SIZE,
  );
  photoCropCache.set(key, cropped);
  return cropped;
}

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
    const maxWidth = pageWidth; // caller passes content width (e.g. half-page contentWidth)
    const cap = sanitizeForPDF(challenge.caption);
    const lines = doc.splitTextToSize(cap, maxWidth) as string[];
    h += 2; // spacing before caption
    h += lines.length * 6;
  }

  // Photos: up to 10 per challenge, 2-column grid (match booklet PHOTO_SIZE/GAP)
  const photoCount = Math.min(challenge.photoIds.length, 10);
  if (photoCount > 0) {
    const PHOTO_SIZE = 36;
    const GAP = 4;
    const rows = Math.ceil(photoCount / 2);
    h += 4; // divider
    h += rows * PHOTO_SIZE + (rows - 1) * GAP;
    h += 8;
  }

  // Spacing after block
  h += 6;

  return h;
}

function ensureSpace(
  requiredHeight: number,
  marginBottom: number,
  currentY: number,
  pageHeight: number,
): boolean {
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

export type PdfExportProgressCallback = (message: string) => void;

export async function exportPdf(
  journey: Journey,
  onProgress?: PdfExportProgressCallback,
  coverPhotoIdParam?: string | null,
) {
  const report = (msg: string) => onProgress?.(msg);

  const jspdfMod = await import('jspdf');
  const jsPDF = jspdfMod.jsPDF;

  const coverPhotoId = coverPhotoIdParam ?? journey.coverPhotoId ?? null;

  report('Preparing fonts…');
  let fontBase64: string | null = null;
  try {
    const resp = await fetch('/fonts/NotoSansTC-Regular.ttf');
    if (resp.ok) fontBase64 = arrayBufferToBase64(await resp.arrayBuffer());
  } catch (e) {
    console.error('PDF font fetch failed:', e);
  }
  if (!fontBase64) {
    console.error(
      'PDF export: place NotoSansTC-Regular.ttf at public/fonts/NotoSansTC-Regular.ttf for CJK.'
    );
  }

  const margin = 10;
  const marginTop = 12;
  const marginBottom = 12;
  const PHOTO_SIZE = 36;
  const PHOTO_GAP = 4;
  const contentWidth = HALF_W_MM - 2 * margin;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [A4_W_MM, A4_H_MM],
    hotfixes: ['px_scaling'],
  });
  addFontToDoc(doc, fontBase64);

  type Half = 'left' | 'right';
  let currentSide: Half = 'left';
  let currentY = marginTop;

  function getContentLeft(side: Half): number {
    return side === 'left' ? margin : HALF_W_MM + margin;
  }

  function beginLogicalHalf(side: Half): void {
    currentSide = side;
    currentY = marginTop;
  }

  function ensureSpaceInHalf(requiredHeight: number): boolean {
    if (currentY + requiredHeight <= PAGE_H_MM - marginBottom) return false;
    newLogicalHalfOrNewSheet();
    return true;
  }

  function newLogicalHalfOrNewSheet(): void {
    if (currentSide === 'left') {
      beginLogicalHalf('right');
    } else {
      doc.addPage([A4_W_MM, A4_H_MM], 'landscape');
      doc.setFillColor(250, 247, 242);
      doc.rect(0, 0, A4_W_MM, A4_H_MM, 'F');
      beginLogicalHalf('left');
    }
  }

  function drawPageBackgroundIfFirst(): void {
    doc.setFillColor(250, 247, 242);
    doc.rect(0, 0, A4_W_MM, A4_H_MM, 'F');
  }

  drawPageBackgroundIfFirst();
  beginLogicalHalf('left');

  // Front cover (logical page 1) in left half
  const halfCenterX = getContentLeft('left') + contentWidth / 2;
  const COVER_FRAME_W_MM = 80;
  const COVER_FRAME_H_MM = 100; // 4:5 portrait
  const COVER_TOP_MM = 20;
  const COVER_LEFT_MM = getContentLeft('left') + (contentWidth - COVER_FRAME_W_MM) / 2;

  let coverY = 50;
  if (coverPhotoId) {
    const blob = await getPhoto(coverPhotoId);
    if (!blob) {
      console.warn('PDF export: coverPhotoId exists but getPhoto returned null', coverPhotoId);
    } else {
      try {
        const dataUrl = await blobToDataUrl(blob);
        const coverDataUrl = await createRoundedImageDataUrl(dataUrl, 400, 500, 20);
        const format = coverDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(
          coverDataUrl,
          format,
          COVER_LEFT_MM,
          COVER_TOP_MM,
          COVER_FRAME_W_MM,
          COVER_FRAME_H_MM,
        );
        coverY = COVER_TOP_MM + COVER_FRAME_H_MM + 24;
      } catch (e) {
        console.warn('PDF export: cover image render failed', e);
      }
    }
  }

  let y = coverY;
  doc.setFont(FONT_NAME_TC, 'normal');
  doc.setTextColor(40);
  doc.setFontSize(24);
  doc.text(safeTitleForPDF(journey.title), halfCenterX, y, { align: 'center' });
  y += 10;
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(
    `${journey.startDate}${journey.endDate ? ' – ' + journey.endDate : ''}`,
    halfCenterX,
    y,
    { align: 'center' },
  );
  y += 12;
  if (journey.buddyName) {
    doc.setFontSize(10);
    doc.text(`with ${journey.buddyName}`, halfCenterX, y, { align: 'center' });
    y += 10;
  }
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    'Three days in Taipei, forever in the camera roll.',
    halfCenterX,
    y,
    { align: 'center' },
  );

  // Content (logical 2..N) — only export completed challenges, grouped by date ascending
  const completedChallenges = journey.challenges.filter(c => c.completed);
  const groups = groupByDate(completedChallenges, journey);
  const totalPhotos = groups.reduce(
    (sum, g) =>
      sum + g.challenges.reduce((s, c) => s + Math.min(c.photoIds.length, 10), 0),
    0,
  );
  let photosLoaded = 0;
  let activeFontName: string | null = FONT_NAME_TC;

  beginLogicalHalf('right');

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    if (group.challenges.length === 0) continue;

    report(
      `Building pages… (${group.label}${groups.length > 1 ? ` ${groupIndex + 1}/${groups.length}` : ''})`
    );

    let needDateHeader = true;
    const dateHeaderHeight = 14;
    for (const challenge of group.challenges) {
      const blockHeight = estimateBlockHeight(doc, challenge, contentWidth, margin);
      const contentLeft = getContentLeft(currentSide);

      if (needDateHeader) {
        if (ensureSpaceInHalf(dateHeaderHeight + blockHeight)) {
          needDateHeader = true;
        }
        if (needDateHeader) {
          if (activeFontName) doc.setFont(activeFontName, 'normal');
          doc.setFontSize(11);
          doc.setTextColor(80);
          doc.text(group.label, contentLeft, currentY);
          currentY += 4;
          doc.setDrawColor(210);
          doc.setLineWidth(0.2);
          doc.line(contentLeft, currentY, contentLeft + contentWidth, currentY);
          currentY += 6;
          needDateHeader = false;
        }
      } else {
        if (ensureSpaceInHalf(blockHeight)) {
          if (activeFontName) doc.setFont(activeFontName, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100);
          doc.text(group.label, contentLeft, currentY);
          currentY += 6;
        }
      }

      doc.setFontSize(13);
      if (activeFontName) doc.setFont(activeFontName, 'normal');
      doc.setTextColor(40);
      doc.text(safeTitleForPDF(challenge.title), contentLeft, currentY);
      currentY += 6;

      doc.setFontSize(8);
      doc.setTextColor(120);
      const metaParts: string[] = [];
      if (challenge.date) metaParts.push(challenge.date);
      if (challenge.location) metaParts.push(challenge.location);
      if (metaParts.length > 0) {
        doc.text(metaParts.join(' • '), contentLeft, currentY);
        currentY += 6;
      } else {
        currentY += 2;
      }

      if (challenge.caption) {
        doc.setFontSize(11);
        if (activeFontName) doc.setFont(activeFontName, 'normal');
        doc.setTextColor(90);
        const cap = sanitizeForPDF(challenge.caption || '');
        const quoted = `“${cap}”`;
        const lines = doc.splitTextToSize(quoted, contentWidth) as string[];
        currentY += 2;
        doc.text(lines, contentLeft, currentY);
        currentY += lines.length * 6;
      }

      const photoIds = challenge.photoIds.slice(0, 10);
      if (photoIds.length > 0) {
        doc.setDrawColor(210);
        doc.setLineWidth(0.2);
        doc.line(contentLeft, currentY, contentLeft + contentWidth, currentY);
        currentY += 4;

        let blockStartY = currentY;
        let photoStartInBlock = 0;
        const halfContentLeft = contentLeft;

        for (let i = 0; i < photoIds.length; i++) {
          const row = Math.floor((i - photoStartInBlock) / 2);
          let placeY = blockStartY + row * (PHOTO_SIZE + PHOTO_GAP);

          if (placeY + PHOTO_SIZE > PAGE_H_MM - marginBottom) {
            newLogicalHalfOrNewSheet();
            const cl = getContentLeft(currentSide);
            if (activeFontName) doc.setFont(activeFontName, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(group.label, cl, currentY);
            currentY += 6;
            blockStartY = currentY;
            photoStartInBlock = i;
            placeY = blockStartY;
          }

          const pid = photoIds[i];
          if (totalPhotos > 0) report(`Loading photos… (${photosLoaded + 1}/${totalPhotos})`);
          const blob = await getPhoto(pid);
          if (blob) {
            try {
              const originalDataUrl = await blobToDataUrl(blob);
              const croppedDataUrl = await getCachedCroppedSquareForPdf(pid, originalDataUrl);
              const format = croppedDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
              const cl = getContentLeft(currentSide);
              const px = cl + (i - photoStartInBlock) % 2 * (PHOTO_SIZE + PHOTO_GAP);
              const py = blockStartY + Math.floor((i - photoStartInBlock) / 2) * (PHOTO_SIZE + PHOTO_GAP);
              doc.addImage(croppedDataUrl, format, px, py, PHOTO_SIZE, PHOTO_SIZE);
            } catch (e) {
              console.error('PDF photo render failed', pid, e);
            }
          }
          photosLoaded += 1;
        }

        const rowsInBlock = Math.ceil((photoIds.length - photoStartInBlock) / 2);
        currentY = blockStartY + rowsInBlock * (PHOTO_SIZE + PHOTO_GAP) - PHOTO_GAP + PHOTO_SIZE + 8;
      }

      currentY += 6;
    }
  }

  // Notes pages (optional): use next halves
  const notesCount = 2;
  for (let n = 0; n < notesCount; n++) {
    newLogicalHalfOrNewSheet();
    const contentLeft = getContentLeft(currentSide);
    if (activeFontName) doc.setFont(activeFontName, 'normal');
    doc.setFontSize(14);
    doc.setTextColor(80);
    doc.text('Notes', contentLeft, 20);
    doc.setDrawColor(220);
    doc.setLineWidth(0.15);
    for (let line = 0; line < 30; line++) {
      const y = 28 + line * 6;
      doc.line(contentLeft, y, contentLeft + contentWidth, y);
    }
  }

  // Back cover
  newLogicalHalfOrNewSheet();
  const backContentLeft = getContentLeft(currentSide);
  if (activeFontName) doc.setFont(activeFontName, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('The end of this journey.', backContentLeft, PAGE_H_MM / 2);

  report('Finalizing…');
  const safeName = sanitizeForPDF(journey.title || 'journey') || 'journey';
  doc.save(`${safeName}.pdf`);
}
