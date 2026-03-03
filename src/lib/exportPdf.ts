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

/** One block on a content logical page. */
type ContentBlock = {
  dateLabel?: string;
  groupLabel: string;
  challenge: JourneyChallenge;
};

/** Logical page: 1=cover, 2..=content, N=back. */
type LogicalPage =
  | { type: 'cover'; journey: Journey; coverPhotoId: string | null }
  | { type: 'content'; blocks: ContentBlock[] }
  | { type: 'notes' }
  | { type: 'back' };

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

/** Build logical pages: cover, content (by date), notes (padded before back), back. N is multiple of 4. */
function buildLogicalPages(
  journey: Journey,
  coverPhotoId: string | null,
  groups: DateGroup[],
  doc: any,
  contentWidth: number,
  margin: number,
  marginTop: number,
  marginBottom: number,
  pageHeight: number,
): LogicalPage[] {
  const pages: LogicalPage[] = [];

  pages.push({ type: 'cover', journey, coverPhotoId });

  let currentBlocks: ContentBlock[] = [];
  let currentY = marginTop;

  for (const group of groups) {
    let needDateHeader = true;
    const dateHeaderHeight = 14;
    for (const challenge of group.challenges) {
      const blockHeight = estimateBlockHeight(doc, challenge, contentWidth, margin);
      const required = needDateHeader ? dateHeaderHeight + blockHeight : 6 + blockHeight;
      if (currentY + required > pageHeight - marginBottom && currentBlocks.length > 0) {
        pages.push({ type: 'content', blocks: currentBlocks });
        currentBlocks = [];
        currentY = marginTop;
        needDateHeader = true;
      }
      if (needDateHeader) {
        currentBlocks.push({
          dateLabel: group.label,
          groupLabel: group.label,
          challenge,
        });
        currentY += dateHeaderHeight + blockHeight;
        needDateHeader = false;
      } else {
        currentBlocks.push({ groupLabel: group.label, challenge });
        currentY += 6 + blockHeight;
      }
    }
  }
  if (currentBlocks.length > 0) pages.push({ type: 'content', blocks: currentBlocks });

  let notesCount = 2;
  const beforeNotes = pages.length + 1;
  if ((beforeNotes + 2) % 4 !== 0) {
    notesCount += (4 - ((beforeNotes + 2) % 4)) % 4;
  }
  for (let n = 0; n < notesCount; n++) pages.push({ type: 'notes' });
  pages.push({ type: 'back' });

  let N = pages.length;
  const pad = (4 - (N % 4)) % 4;
  for (let i = 0; i < pad; i++) pages.splice(pages.length - 1, 0, { type: 'notes' });
  return pages;
}

type RenderLogicalPageOpts = {
  margin: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  PHOTO_SIZE: number;
  PHOTO_GAP: number;
  fontName: string | null;
  report: PdfExportProgressCallback;
};

/** Draw one logical page in mm. Local y only; never addPage; draw only in [originX, originX+halfW]. */
async function renderLogicalPage(
  doc: any,
  page: LogicalPage,
  originX: number,
  originY: number,
  halfW: number,
  pageH: number,
  opts: RenderLogicalPageOpts,
): Promise<void> {
  const { margin, marginTop, marginBottom, contentWidth, PHOTO_SIZE, PHOTO_GAP, fontName, report } = opts;
  let y = originY + marginTop;
  const contentLeft = originX + margin;

  doc.setFillColor(250, 247, 242);
  doc.rect(originX, originY, halfW, pageH, 'F');
  if (fontName) doc.setFont(fontName, 'normal');

  if (page.type === 'cover') {
    const halfCenterX = contentLeft + contentWidth / 2;
    const COVER_FRAME_W_MM = 80;
    const COVER_FRAME_H_MM = 100;
    const COVER_TOP_MM = originY + 20;
    const COVER_LEFT_MM = contentLeft + (contentWidth - COVER_FRAME_W_MM) / 2;
    let coverY = originY + 50;
    if (page.coverPhotoId) {
      const blob = await getPhoto(page.coverPhotoId);
      if (blob) {
        try {
          const dataUrl = await blobToDataUrl(blob);
          const coverDataUrl = await createRoundedImageDataUrl(dataUrl, 400, 500, 20);
          const format = coverDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(coverDataUrl, format, COVER_LEFT_MM, COVER_TOP_MM, COVER_FRAME_W_MM, COVER_FRAME_H_MM);
          coverY = COVER_TOP_MM + COVER_FRAME_H_MM + 24;
        } catch (e) {
          console.warn('PDF export: cover image render failed', e);
        }
      }
    }
    y = coverY;
    doc.setFontSize(24);
    doc.setTextColor(40);
    doc.text(safeTitleForPDF(page.journey.title), halfCenterX, y, { align: 'center' });
    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(
      `${page.journey.startDate}${page.journey.endDate ? ' – ' + page.journey.endDate : ''}`,
      halfCenterX,
      y,
      { align: 'center' },
    );
    y += 12;
    if (page.journey.buddyName) {
      doc.setFontSize(10);
      doc.text(`with ${page.journey.buddyName}`, halfCenterX, y, { align: 'center' });
      y += 10;
    }
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text('Three days in Taipei, forever in the camera roll.', halfCenterX, y, { align: 'center' });
    return;
  }

  if (page.type === 'content') {
    const totalPhotos = page.blocks.reduce(
      (sum, b) => sum + Math.min(b.challenge.photoIds.length, 10),
      0,
    );
    let photosLoaded = 0;
    for (const block of page.blocks) {
      const needDateHeader = !!block.dateLabel;
      if (needDateHeader) {
        if (fontName) doc.setFont(fontName, 'normal');
        doc.setFontSize(11);
        doc.setTextColor(80);
        doc.text(block.groupLabel, contentLeft, y);
        y += 4;
        doc.setDrawColor(210);
        doc.setLineWidth(0.2);
        doc.line(contentLeft, y, contentLeft + contentWidth, y);
        y += 6;
      } else {
        if (fontName) doc.setFont(fontName, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(block.groupLabel, contentLeft, y);
        y += 6;
      }
      doc.setFontSize(13);
      if (fontName) doc.setFont(fontName, 'normal');
      doc.setTextColor(40);
      doc.text(safeTitleForPDF(block.challenge.title), contentLeft, y);
      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(120);
      const metaParts: string[] = [];
      if (block.challenge.date) metaParts.push(block.challenge.date);
      if (block.challenge.location) metaParts.push(block.challenge.location);
      if (metaParts.length > 0) {
        doc.text(metaParts.join(' • '), contentLeft, y);
        y += 6;
      } else {
        y += 2;
      }
      if (block.challenge.caption) {
        doc.setFontSize(11);
        if (fontName) doc.setFont(fontName, 'normal');
        doc.setTextColor(90);
        const cap = sanitizeForPDF(block.challenge.caption || '');
        const quoted = `"${cap}"`;
        const lines = doc.splitTextToSize(quoted, contentWidth) as string[];
        y += 2;
        doc.text(lines, contentLeft, y);
        y += lines.length * 6;
      }
      const photoIds = block.challenge.photoIds.slice(0, 10);
      if (photoIds.length > 0) {
        doc.setDrawColor(210);
        doc.setLineWidth(0.2);
        doc.line(contentLeft, y, contentLeft + contentWidth, y);
        y += 4;
        const blockStartY = y;
        for (let i = 0; i < photoIds.length; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const px = contentLeft + col * (PHOTO_SIZE + PHOTO_GAP);
          const py = blockStartY + row * (PHOTO_SIZE + PHOTO_GAP);
          const pid = photoIds[i];
          if (totalPhotos > 0) report(`Loading photos… (${photosLoaded + 1}/${totalPhotos})`);
          const blob = await getPhoto(pid);
          if (blob) {
            try {
              const originalDataUrl = await blobToDataUrl(blob);
              const croppedDataUrl = await getCachedCroppedSquareForPdf(pid, originalDataUrl);
              const format = croppedDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
              doc.addImage(croppedDataUrl, format, px, py, PHOTO_SIZE, PHOTO_SIZE);
            } catch (e) {
              console.error('PDF photo render failed', pid, e);
            }
          }
          photosLoaded += 1;
        }
        const rowsInBlock = Math.ceil(photoIds.length / 2);
        y = blockStartY + rowsInBlock * (PHOTO_SIZE + PHOTO_GAP) - PHOTO_GAP + PHOTO_SIZE + 8;
      }
      y += 6;
    }
    return;
  }

  if (page.type === 'notes') {
    doc.setFontSize(14);
    doc.setTextColor(80);
    doc.text('Notes', contentLeft, originY + 20);
    doc.setDrawColor(220);
    doc.setLineWidth(0.15);
    for (let line = 0; line < 30; line++) {
      const ly = originY + 28 + line * 6;
      doc.line(contentLeft, ly, contentLeft + contentWidth, ly);
    }
    return;
  }

  if (page.type === 'back') {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('The end of this journey.', contentLeft, originY + pageH / 2);
    return;
  }
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

const DEBUG_BOOKLET_N8 = false;

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

  const completedChallenges = journey.challenges.filter(c => c.completed);
  const groups = groupByDate(completedChallenges, journey);
  report('Building pages…');
  const measureDoc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [A4_W_MM, A4_H_MM],
    hotfixes: ['px_scaling'],
  });
  addFontToDoc(measureDoc, fontBase64);
  const logicalPages = buildLogicalPages(
    journey,
    coverPhotoId,
    groups,
    measureDoc,
    contentWidth,
    margin,
    marginTop,
    marginBottom,
    PAGE_H_MM,
  );
  const N = logicalPages.length;
  const sheetCount = N / 4;

  if (DEBUG_BOOKLET_N8 && N === 8) {
    const parts: string[] = [];
    for (let k = 0; k < sheetCount; k++) {
      const frontL = N - 2 * k;
      const frontR = 1 + 2 * k;
      const backL = 2 + 2 * k;
      const backR = N - 1 - 2 * k;
      parts.push(
        `Sheet${k} front L=${frontL} R=${frontR}; back L=${backL} R=${backR}`,
      );
    }
    console.log(parts.join('; '));
  }

  const finalDoc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [A4_W_MM, A4_H_MM],
    hotfixes: ['px_scaling'],
  });
  const activeFontName = addFontToDoc(finalDoc, fontBase64);
  const opts: RenderLogicalPageOpts = {
    margin,
    marginTop,
    marginBottom,
    contentWidth,
    PHOTO_SIZE,
    PHOTO_GAP,
    fontName: activeFontName,
    report,
  };

  const saveRestore = (fn: () => Promise<void>) => {
    if (typeof (finalDoc as any).saveGraphicsState === 'function') {
      return (async () => {
        (finalDoc as any).saveGraphicsState();
        await fn();
        (finalDoc as any).restoreGraphicsState();
      })();
    }
    return fn();
  };

  for (let k = 0; k < sheetCount; k++) {
    if (k > 0) finalDoc.addPage([A4_W_MM, A4_H_MM], 'landscape');
    finalDoc.setFillColor(250, 247, 242);
    finalDoc.rect(0, 0, A4_W_MM, A4_H_MM, 'F');
    await saveRestore(() =>
      renderLogicalPage(
        finalDoc,
        logicalPages[N - 1 - 2 * k],
        0,
        0,
        HALF_W_MM,
        PAGE_H_MM,
        opts,
      ),
    );
    await saveRestore(() =>
      renderLogicalPage(
        finalDoc,
        logicalPages[2 * k],
        HALF_W_MM,
        0,
        HALF_W_MM,
        PAGE_H_MM,
        opts,
      ),
    );
    finalDoc.addPage([A4_W_MM, A4_H_MM], 'landscape');
    finalDoc.setFillColor(250, 247, 242);
    finalDoc.rect(0, 0, A4_W_MM, A4_H_MM, 'F');
    await saveRestore(() =>
      renderLogicalPage(
        finalDoc,
        logicalPages[2 * k + 1],
        0,
        0,
        HALF_W_MM,
        PAGE_H_MM,
        opts,
      ),
    );
    await saveRestore(() =>
      renderLogicalPage(
        finalDoc,
        logicalPages[N - 2 - 2 * k],
        HALF_W_MM,
        0,
        HALF_W_MM,
        PAGE_H_MM,
        opts,
      ),
    );
  }

  report('Finalizing…');
  const safeName = sanitizeForPDF(journey.title || 'journey') || 'journey';
  finalDoc.save(`${safeName}.pdf`);
}
