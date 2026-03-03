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
// Logical (half) page size for booklet imposition. Left-bound: duplex, flip short edge, fold.
const LOGICAL_W_MM = 148.5;
const LOGICAL_H_MM = 210;

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

/** Logical page for booklet: page 1=cover, 2..=content, last=back. */
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

const CANVAS_W_PX = 1654;
const CANVAS_H_PX = 2339;

/** Build logical pages in reading order: 1=cover, 2..=content (chronological), last=N=back. Pad with Notes BEFORE back until N is multiple of 4. */
function buildLogicalPages(
  journey: Journey,
  groups: DateGroup[],
  measureDoc: any,
  coverPhotoId: string | null,
  margin: number,
  marginTop: number,
  marginBottom: number,
  contentWidth: number,
  dateHeaderHeight: number,
): LogicalPage[] {
  const pages: LogicalPage[] = [];
  pages.push({ type: 'cover', journey, coverPhotoId });

  let currentSide: 'left' | 'right' = 'right';
  let currentY = marginTop;
  let currentBlocks: ContentBlock[] = [];

  function needNewHalf(required: number): boolean {
    if (currentY + required <= PAGE_H_MM - marginBottom) return false;
    if (currentBlocks.length > 0) {
      pages.push({ type: 'content', blocks: currentBlocks });
      currentBlocks = [];
    }
    currentSide = currentSide === 'left' ? 'right' : 'left';
    currentY = marginTop;
    return true;
  }

  for (const group of groups) {
    if (group.challenges.length === 0) continue;
    let needDateHeader = true;
    for (const challenge of group.challenges) {
      const blockHeight = estimateBlockHeight(measureDoc, challenge, contentWidth, margin);
      if (needDateHeader) {
        needNewHalf(dateHeaderHeight + blockHeight);
        currentBlocks.push({ dateLabel: group.label, groupLabel: group.label, challenge });
        currentY = marginTop + dateHeaderHeight + blockHeight + 6;
        needDateHeader = false;
      } else {
        if (needNewHalf(blockHeight)) {
          currentBlocks.push({ groupLabel: group.label, challenge });
          currentY = marginTop + 6 + blockHeight + 6;
        } else {
          currentBlocks.push({ groupLabel: group.label, challenge });
          currentY += blockHeight + 6;
        }
      }
    }
  }
  if (currentBlocks.length > 0) pages.push({ type: 'content', blocks: currentBlocks });

  const contentPageCount = pages.length - 1;
  let notesCount = (4 - ((contentPageCount + 2) % 4)) % 4;
  if (notesCount < 2) notesCount += 4;
  for (let n = 0; n < notesCount; n++) pages.push({ type: 'notes' });
  pages.push({ type: 'back' });
  let N = pages.length;
  if (N % 4 !== 0) {
    const extra = 4 - (N % 4);
    for (let e = 0; e < extra; e++) pages.splice(pages.length - 1, 0, { type: 'notes' });
    N = pages.length;
  }
  return pages;
}

/** Render one logical page to canvas (same content as jsPDF flow); no pdfjs. */
async function renderLogicalPageToCanvas(
  page: LogicalPage,
  opts: {
    margin: number;
    contentWidth: number;
    marginTop: number;
    marginBottom: number;
    PHOTO_SIZE: number;
    PHOTO_GAP: number;
    coverPhotoId: string | null;
    fontFamily: string;
    report: (m: string) => void;
    getPhoto: (id: string) => Promise<Blob | undefined>;
    blobToDataUrl: (b: Blob) => Promise<string>;
    getCachedCroppedSquareForPdf: (id: string, u: string) => Promise<string>;
    createRoundedImageDataUrl: (u: string, w: number, h: number, r: number) => Promise<string>;
  },
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W_PX;
  canvas.height = CANVAS_H_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d failed');
  const pxPerMm = CANVAS_W_PX / LOGICAL_W_MM;
  ctx.fillStyle = 'rgb(250,247,242)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(pxPerMm, pxPerMm);
  const contentLeft = opts.margin;
  const centerX = contentLeft + opts.contentWidth / 2;

  if (page.type === 'cover') {
    const j = page.journey;
    let y = 50;
    if (opts.coverPhotoId) {
      const blob = await opts.getPhoto(opts.coverPhotoId);
      if (blob) {
        try {
          const dataUrl = await opts.blobToDataUrl(blob);
          const rounded = await opts.createRoundedImageDataUrl(dataUrl, 400, 500, 20);
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = rounded;
          });
          const cw = 80;
          const ch = 100;
          ctx.drawImage(img, centerX - cw / 2, 20, cw, ch);
          y = 20 + ch + 24;
        } catch (_) {}
      }
    }
    ctx.fillStyle = 'rgb(40,40,40)';
    ctx.font = `24px ${opts.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(safeTitleForPDF(j.title), centerX, y);
    y += 10;
    ctx.font = `12px ${opts.fontFamily}`;
    ctx.fillStyle = 'rgb(100,100,100)';
    ctx.fillText(`${j.startDate}${j.endDate ? ' – ' + j.endDate : ''}`, centerX, y);
    y += 12;
    if (j.buddyName) {
      ctx.font = `10px ${opts.fontFamily}`;
      ctx.fillText(`with ${j.buddyName}`, centerX, y);
      y += 10;
    }
    y += 8;
    ctx.font = `10px ${opts.fontFamily}`;
    ctx.fillStyle = 'rgb(120,120,120)';
    ctx.fillText('Three days in Taipei, forever in the camera roll.', centerX, y);
  } else if (page.type === 'content') {
    let y = opts.marginTop;
    ctx.textAlign = 'left';
    for (const b of page.blocks) {
      if (b.dateLabel) {
        ctx.font = `11px ${opts.fontFamily}`;
        ctx.fillStyle = 'rgb(80,80,80)';
        ctx.fillText(b.dateLabel, contentLeft, y);
        y += 4;
        ctx.strokeStyle = 'rgb(210,210,210)';
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        ctx.moveTo(contentLeft, y);
        ctx.lineTo(contentLeft + opts.contentWidth, y);
        ctx.stroke();
        y += 6;
      } else if (b.groupLabel) {
        ctx.font = `9px ${opts.fontFamily}`;
        ctx.fillStyle = 'rgb(100,100,100)';
        ctx.fillText(b.groupLabel, contentLeft, y);
        y += 6;
      }
      ctx.font = `13px ${opts.fontFamily}`;
      ctx.fillStyle = 'rgb(40,40,40)';
      ctx.fillText(safeTitleForPDF(b.challenge.title), contentLeft, y);
      y += 6;
      ctx.font = `8px ${opts.fontFamily}`;
      ctx.fillStyle = 'rgb(120,120,120)';
      const meta: string[] = [];
      if (b.challenge.date) meta.push(b.challenge.date);
      if (b.challenge.location) meta.push(b.challenge.location);
      if (meta.length) {
        ctx.fillText(meta.join(' • '), contentLeft, y);
        y += 6;
      } else y += 2;
      if (b.challenge.caption) {
        ctx.font = `11px ${opts.fontFamily}`;
        ctx.fillStyle = 'rgb(90,90,90)';
        const cap = sanitizeForPDF(b.challenge.caption);
        const q = `\u201C${cap}\u201D`;
        const lineH = 6;
        y += 2;
        const parts = q.split(/(\s+)/);
        let line = '';
        for (let i = 0; i < parts.length; i++) {
          const test = line + (i ? parts[i] : '');
          if (ctx.measureText(test).width > opts.contentWidth && line) {
            ctx.fillText(line, contentLeft, y);
            y += lineH;
            line = parts[i] || '';
          } else line = test;
        }
        if (line) {
          ctx.fillText(line, contentLeft, y);
          y += lineH;
        }
        y += 4;
      }
      const pids = b.challenge.photoIds.slice(0, 10);
      if (pids.length) {
        ctx.strokeStyle = 'rgb(210,210,210)';
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        ctx.moveTo(contentLeft, y);
        ctx.lineTo(contentLeft + opts.contentWidth, y);
        ctx.stroke();
        y += 4;
        const sz = opts.PHOTO_SIZE;
        const gap = opts.PHOTO_GAP;
        for (let i = 0; i < pids.length; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const px = contentLeft + col * (sz + gap);
          const py = y + row * (sz + gap);
          const blob = await opts.getPhoto(pids[i]);
          if (blob) {
            try {
              const orig = await opts.blobToDataUrl(blob);
              const cropped = await opts.getCachedCroppedSquareForPdf(pids[i], orig);
              const img = await new Promise<HTMLImageElement>((res, rej) => {
                const im = new Image();
                im.onload = () => res(im);
                im.onerror = rej;
                im.src = cropped;
              });
              ctx.drawImage(img, px, py, sz, sz);
            } catch (_) {}
          }
        }
        const rows = Math.ceil(pids.length / 2);
        y += rows * (sz + gap) - gap + sz + 8;
      }
      y += 6;
    }
  } else if (page.type === 'notes') {
    ctx.font = `14px ${opts.fontFamily}`;
    ctx.fillStyle = 'rgb(80,80,80)';
    ctx.fillText('Notes', contentLeft, 20);
    ctx.strokeStyle = 'rgb(220,220,220)';
    ctx.lineWidth = 0.15;
    for (let line = 0; line < 30; line++) {
      const yy = 28 + line * 6;
      ctx.beginPath();
      ctx.moveTo(contentLeft, yy);
      ctx.lineTo(contentLeft + opts.contentWidth, yy);
      ctx.stroke();
    }
  } else {
    ctx.font = `10px ${opts.fontFamily}`;
    ctx.fillStyle = 'rgb(100,100,100)';
    ctx.fillText('The end of this journey.', contentLeft, LOGICAL_H_MM / 2);
  }
  ctx.restore();
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
  const dateHeaderHeight = 14;

  const completedChallenges = journey.challenges.filter(c => c.completed);
  const groups = groupByDate(completedChallenges, journey);

  report('Building booklet layout…');
  const measureDoc = new jsPDF({
    unit: 'mm',
    format: [LOGICAL_W_MM, LOGICAL_H_MM],
    hotfixes: ['px_scaling'],
  });
  addFontToDoc(measureDoc, fontBase64);
  const logicalPages = buildLogicalPages(
    journey,
    groups,
    measureDoc,
    coverPhotoId,
    margin,
    marginTop,
    marginBottom,
    contentWidth,
    dateHeaderHeight,
  );
  const N = logicalPages.length;

  if (fontBase64) {
    try {
      const fontFace = new FontFace('NotoSansTC', `url(data:font/ttf;base64,${fontBase64})`);
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch (_) {}
  }

  report('Rendering pages…');
  const pageImages: string[] = [];
  const renderOpts = {
    margin,
    contentWidth,
    marginTop,
    marginBottom,
    PHOTO_SIZE,
    PHOTO_GAP,
    coverPhotoId: null as string | null,
    fontFamily: 'NotoSansTC',
    report,
    getPhoto,
    blobToDataUrl,
    getCachedCroppedSquareForPdf,
    createRoundedImageDataUrl,
  };
  for (let p = 0; p < logicalPages.length; p++) {
    report(`Rendering page ${p + 1}/${logicalPages.length}…`);
    const coverId = logicalPages[p].type === 'cover' ? logicalPages[p].coverPhotoId : null;
    pageImages.push(
      await renderLogicalPageToCanvas(logicalPages[p], { ...renderOpts, coverPhotoId: coverId }),
    );
  }

  // Left-bound booklet: for sheet k = 0..(N/4 - 1): front left=N-2k, right=1+2k; back left=2+2k, right=N-1-2k. Duplex, flip short edge, fold.
  const DEBUG_BOOKLET_N8 = false; // set true to log mapping when N=8
  if (DEBUG_BOOKLET_N8 && N === 8) {
    const sheetCount = N / 4;
    for (let k = 0; k < sheetCount; k++) {
      const frontLeft = N - 2 * k;
      const frontRight = 1 + 2 * k;
      const backLeft = 2 + 2 * k;
      const backRight = N - 1 - 2 * k;
      console.log(
        `Sheet ${k} front: left=page ${frontLeft} right=page ${frontRight} | Sheet ${k} back: left=page ${backLeft} right=page ${backRight}`,
      );
    }
  }

  const finalDoc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [A4_W_MM, A4_H_MM],
    hotfixes: ['px_scaling'],
  });
  const sheetCount = N / 4;
  for (let k = 0; k < sheetCount; k++) {
    finalDoc.addPage([A4_W_MM, A4_H_MM], 'landscape');
    const frontLeftIdx = N - 1 - 2 * k;
    const frontRightIdx = 2 * k;
    finalDoc.addImage(pageImages[frontLeftIdx], 'PNG', 0, 0, LOGICAL_W_MM, LOGICAL_H_MM);
    finalDoc.addImage(pageImages[frontRightIdx], 'PNG', LOGICAL_W_MM, 0, LOGICAL_W_MM, LOGICAL_H_MM);
  }
  for (let k = 0; k < sheetCount; k++) {
    finalDoc.addPage([A4_W_MM, A4_H_MM], 'landscape');
    const backLeftIdx = 2 * k + 1;
    const backRightIdx = N - 2 - 2 * k;
    finalDoc.addImage(pageImages[backLeftIdx], 'PNG', 0, 0, LOGICAL_W_MM, LOGICAL_H_MM);
    finalDoc.addImage(pageImages[backRightIdx], 'PNG', LOGICAL_W_MM, 0, LOGICAL_W_MM, LOGICAL_H_MM);
  }
  finalDoc.deletePage(1);

  report('Finalizing…');
  const safeName = sanitizeForPDF(journey.title || 'journey') || 'journey';
  finalDoc.save(`${safeName}.pdf`);
}

