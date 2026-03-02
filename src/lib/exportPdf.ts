import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';
import { cropImageToDataURL } from './imageUtils';
import { GlobalWorkerOptions } from 'pdfjs-dist';

// pdfjs worker must be set before any getDocument() call. Worker file is copied to public/ at postinstall.
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// We embed Noto Sans TC as a Unicode (Identity-H) font for zh/ja.
const FONT_FILE_TC = 'NotoSansTC-Regular.ttf';
const FONT_NAME_TC = 'NotoSansTC';

// Logical page size (A5 landscape = half of A4 landscape). Print duplex, flip on short edge, then fold.
const LOGICAL_W_MM = 148.5;
const LOGICAL_H_MM = 210;
const A4_W_MM = 297;
const A4_H_MM = 210;

/** Renders a single-page PDF (ArrayBuffer) to a PNG dataURL at given scale for crisp text. */
async function renderPdfPageToImageDataUrl(
  pdfArrayBuffer: ArrayBuffer,
  scale: number = 2,
): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  const renderContext = {
    canvasContext: ctx,
    viewport,
    enableWebGL: false,
  };
  await page.render(renderContext).promise;
  return canvas.toDataURL('image/png');
}

/** Add font to a jsPDF instance (reusable for logical-page docs). */
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

/** Create a single logical page doc (A5 landscape 148.5×210mm). jsPDF is passed in so callers use one consistent import. */
function createLogicalPageDoc(jsPDF: any): any {
  return new jsPDF({
    unit: 'mm',
    format: [LOGICAL_W_MM, LOGICAL_H_MM],
    hotfixes: ['px_scaling'],
  });
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
  const contentWidth = LOGICAL_W_MM - 2 * margin;
  const marginTop = 12;
  const marginBottom = 12;
  const PHOTO_SIZE = 36;
  const PHOTO_GAP = 4;

  const logicalPageBuffers: ArrayBuffer[] = [];

  // Front cover (logical page 1)
  const frontDoc = createLogicalPageDoc(jsPDF);
  addFontToDoc(frontDoc, fontBase64);
  frontDoc.setFillColor(250, 247, 242);
  frontDoc.rect(0, 0, LOGICAL_W_MM, LOGICAL_H_MM, 'F');
  frontDoc.setFont(FONT_NAME_TC, 'normal');
  const centerX = LOGICAL_W_MM / 2;
  const COVER_FRAME_W_MM = 80;
  const COVER_FRAME_H_MM = 100; // 4:5 portrait
  const COVER_TOP_MM = 20;
  const COVER_LEFT_MM = centerX - COVER_FRAME_W_MM / 2;

  let coverY = 50; // text start when no cover image
  if (coverPhotoId) {
    const blob = await getPhoto(coverPhotoId);
    if (!blob) {
      console.warn('PDF export: coverPhotoId exists but getPhoto returned null', coverPhotoId);
    } else {
      try {
        const dataUrl = await blobToDataUrl(blob);
        const coverDataUrl = await createRoundedImageDataUrl(
          dataUrl,
          400,
          500,
          20,
        );
        const format = coverDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        frontDoc.addImage(
          coverDataUrl,
          format,
          COVER_LEFT_MM,
          COVER_TOP_MM,
          COVER_FRAME_W_MM,
          COVER_FRAME_H_MM,
        );
        coverY = COVER_TOP_MM + COVER_FRAME_H_MM + 24; // gap below photo before title (~12mm added)
      } catch (e) {
        console.warn('PDF export: cover image render failed', e);
      }
    }
  }

  let y = coverY;
  frontDoc.setTextColor(40);
  frontDoc.setFontSize(24);
  frontDoc.text(safeTitleForPDF(journey.title), centerX, y, { align: 'center' });
  y += 10;
  frontDoc.setFontSize(12);
  frontDoc.setTextColor(100);
  frontDoc.text(
    `${journey.startDate}${journey.endDate ? ' – ' + journey.endDate : ''}`,
    centerX,
    y,
    { align: 'center' },
  );
  y += 12;
  if (journey.buddyName) {
    frontDoc.setFontSize(10);
    frontDoc.text(`with ${journey.buddyName}`, centerX, y, { align: 'center' });
    y += 10;
  }
  y += 8;
  frontDoc.setFontSize(10);
  frontDoc.setTextColor(120);
  frontDoc.text(
    'Three days in Taipei, forever in the camera roll.',
    centerX,
    y,
    { align: 'center' },
  );
  logicalPageBuffers.push(frontDoc.output('arraybuffer') as ArrayBuffer);

  // Content pages (logical 2..N) — only export completed challenges, grouped by date
  const completedChallenges = journey.challenges.filter(c => c.completed);
  const groups = groupByDate(completedChallenges, journey);
  const totalPhotos = groups.reduce(
    (sum, g) =>
      sum + g.challenges.reduce((s, c) => s + Math.min(c.photoIds.length, 10), 0),
    0,
  );
  let photosLoaded = 0;

  let currentDoc: any = null;
  let currentY = marginTop;
  let activeFontName: string | null = null;

  const finishLogicalPage = () => {
    if (currentDoc) {
      logicalPageBuffers.push(currentDoc.output('arraybuffer') as ArrayBuffer);
      currentDoc = null;
    }
  };

  const startNewLogicalPage = () => {
    finishLogicalPage();
    currentDoc = createLogicalPageDoc(jsPDF);
    activeFontName = addFontToDoc(currentDoc, fontBase64);
    currentDoc.setFillColor(250, 247, 242);
    currentDoc.rect(0, 0, LOGICAL_W_MM, LOGICAL_H_MM, 'F');
    currentY = marginTop;
  };

  if (groups.length > 0) startNewLogicalPage();

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    if (group.challenges.length === 0) continue;

    report(
      `Building pages… (${group.label}${groups.length > 1 ? ` ${groupIndex + 1}/${groups.length}` : ''})`
    );

    let needDateHeader = true;
    const dateHeaderHeight = 14;
    for (const challenge of group.challenges) {
      if (!currentDoc) startNewLogicalPage();
      const doc = currentDoc;
      const blockHeight = estimateBlockHeight(doc, challenge, contentWidth, margin);
      const contentLeft = margin;

      if (needDateHeader) {
        if (
          ensureSpace(dateHeaderHeight + blockHeight, marginBottom, currentY, LOGICAL_H_MM)
        ) {
          startNewLogicalPage();
          needDateHeader = true;
        }
        if (needDateHeader && currentDoc) {
          if (activeFontName) currentDoc.setFont(activeFontName, 'normal');
          currentDoc.setFontSize(11);
          currentDoc.setTextColor(80);
          currentDoc.text(group.label, contentLeft, currentY);
          currentY += 4;
          currentDoc.setDrawColor(210);
          currentDoc.setLineWidth(0.2);
          currentDoc.line(contentLeft, currentY, contentLeft + contentWidth, currentY);
          currentY += 6;
          needDateHeader = false;
        }
      } else {
        if (ensureSpace(blockHeight, marginBottom, currentY, LOGICAL_H_MM)) {
          startNewLogicalPage();
          if (activeFontName) currentDoc?.setFont(activeFontName, 'normal');
          currentDoc?.setFontSize(9);
          currentDoc?.setTextColor(100);
          currentDoc?.text(group.label, margin, currentY);
          currentY += 6;
        }
      }

      if (!currentDoc) continue;
      currentDoc.setFontSize(13);
      if (activeFontName) currentDoc.setFont(activeFontName, 'normal');
      currentDoc.setTextColor(40);
      currentDoc.text(safeTitleForPDF(challenge.title), contentLeft, currentY);
      currentY += 6;

      currentDoc.setFontSize(8);
      currentDoc.setTextColor(120);
      const metaParts: string[] = [];
      if (challenge.date) metaParts.push(challenge.date);
      if (challenge.location) metaParts.push(challenge.location);
      if (metaParts.length > 0) {
        currentDoc.text(metaParts.join(' • '), contentLeft, currentY);
        currentY += 6;
      } else {
        currentY += 2;
      }

      if (challenge.caption) {
        currentDoc.setFontSize(11);
        if (activeFontName) currentDoc.setFont(activeFontName, 'normal');
        currentDoc.setTextColor(90);
        const cap = sanitizeForPDF(challenge.caption || '');
        const quoted = `“${cap}”`;
        const lines = currentDoc.splitTextToSize(quoted, contentWidth) as string[];
        currentY += 2;
        currentDoc.text(lines, contentLeft, currentY);
        currentY += lines.length * 6;
      }

      const photoIds = challenge.photoIds.slice(0, 10);
      if (photoIds.length > 0 && currentDoc) {
        currentDoc.setDrawColor(210);
        currentDoc.setLineWidth(0.2);
        currentDoc.line(contentLeft, currentY, contentLeft + contentWidth, currentY);
        currentY += 4;

        let blockStartY = currentY;
        let photoStartInBlock = 0;
        const halfContentLeft = contentLeft;

        for (let i = 0; i < photoIds.length; i++) {
          const row = Math.floor((i - photoStartInBlock) / 2);
          let placeY = blockStartY + row * (PHOTO_SIZE + PHOTO_GAP);

          if (placeY + PHOTO_SIZE > LOGICAL_H_MM - marginBottom) {
            startNewLogicalPage();
            if (activeFontName) currentDoc?.setFont(activeFontName, 'normal');
            currentDoc?.setFontSize(9);
            currentDoc?.setTextColor(100);
            currentDoc?.text(group.label, margin, currentY);
            currentY += 6;
            blockStartY = currentY;
            photoStartInBlock = i;
            placeY = blockStartY;
          }

          const pid = photoIds[i];
          if (totalPhotos > 0) report(`Loading photos… (${photosLoaded + 1}/${totalPhotos})`);
          const blob = await getPhoto(pid);
          if (blob && currentDoc) {
            try {
              const originalDataUrl = await blobToDataUrl(blob);
              const croppedDataUrl = await getCachedCroppedSquareForPdf(pid, originalDataUrl);
              const format = croppedDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
              const px = halfContentLeft + (i - photoStartInBlock) % 2 * (PHOTO_SIZE + PHOTO_GAP);
              const py = blockStartY + Math.floor((i - photoStartInBlock) / 2) * (PHOTO_SIZE + PHOTO_GAP);
              currentDoc.addImage(croppedDataUrl, format, px, py, PHOTO_SIZE, PHOTO_SIZE);
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

  finishLogicalPage();

  const contentPageCount = logicalPageBuffers.length - 1;
  let notesCount = (4 - ((contentPageCount + 2) % 4)) % 4;
  if (notesCount === 0) notesCount = 2;
  let T = 1 + contentPageCount + notesCount + 1;
  if (T % 4 !== 0) notesCount += 4 - (T % 4);
  T = 1 + contentPageCount + notesCount + 1;

  for (let n = 0; n < notesCount; n++) {
    const notesDoc = createLogicalPageDoc(jsPDF);
    addFontToDoc(notesDoc, fontBase64);
    notesDoc.setFont(activeFontName || 'NotoSans', 'normal');
    notesDoc.setFontSize(14);
    notesDoc.setTextColor(80);
    notesDoc.text('Notes', margin, 20);
    notesDoc.setDrawColor(220);
    notesDoc.setLineWidth(0.15);
    for (let line = 0; line < 30; line++) {
      const y = 28 + line * 6;
      notesDoc.line(margin, y, LOGICAL_W_MM - margin, y);
    }
    logicalPageBuffers.push(notesDoc.output('arraybuffer') as ArrayBuffer);
  }

  const backDoc = createLogicalPageDoc(jsPDF);
  addFontToDoc(backDoc, fontBase64);
  backDoc.setFont(activeFontName || 'NotoSans', 'normal');
  backDoc.setFontSize(10);
  backDoc.setTextColor(100);
  backDoc.text('The end of this journey.', margin, LOGICAL_H_MM / 2);
  logicalPageBuffers.push(backDoc.output('arraybuffer') as ArrayBuffer);

  while (logicalPageBuffers.length % 4 !== 0) {
    const extraNotes = createLogicalPageDoc(jsPDF);
    addFontToDoc(extraNotes, fontBase64);
    extraNotes.setFont(activeFontName || 'NotoSans', 'normal');
    extraNotes.setFontSize(14);
    extraNotes.setTextColor(80);
    extraNotes.text('Notes', margin, 20);
    extraNotes.setDrawColor(220);
    extraNotes.setLineWidth(0.15);
    for (let line = 0; line < 30; line++) {
      const y = 28 + line * 6;
      extraNotes.line(margin, y, LOGICAL_W_MM - margin, y);
    }
    logicalPageBuffers.splice(logicalPageBuffers.length - 1, 0, extraNotes.output('arraybuffer') as ArrayBuffer);
  }

  report('Rendering pages…');
  const pageImages: string[] = [];
  const scale = 2;
  for (let p = 0; p < logicalPageBuffers.length; p++) {
    report(`Rendering page ${p + 1}/${logicalPageBuffers.length}…`);
    const dataUrl = await renderPdfPageToImageDataUrl(logicalPageBuffers[p], scale);
    pageImages.push(dataUrl);
  }

  const finalT = pageImages.length;
  const finalDoc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [A4_W_MM, A4_H_MM],
    hotfixes: ['px_scaling'],
  });

  for (let i = 0; i < finalT / 2; i++) {
    finalDoc.addPage([A4_W_MM, A4_H_MM], 'landscape');
    const leftIdx = finalT - 2 * i - 1;
    const rightIdx = 2 * i;
    finalDoc.addImage(pageImages[leftIdx], 'PNG', 0, 0, LOGICAL_W_MM, LOGICAL_H_MM);
    finalDoc.addImage(pageImages[rightIdx], 'PNG', LOGICAL_W_MM, 0, LOGICAL_W_MM, LOGICAL_H_MM);
  }
  for (let i = 0; i < finalT / 2; i++) {
    finalDoc.addPage([A4_W_MM, A4_H_MM], 'landscape');
    const leftIdx = 2 * i + 1;
    const rightIdx = finalT - 2 * i - 2;
    finalDoc.addImage(pageImages[leftIdx], 'PNG', 0, 0, LOGICAL_W_MM, LOGICAL_H_MM);
    finalDoc.addImage(pageImages[rightIdx], 'PNG', LOGICAL_W_MM, 0, LOGICAL_W_MM, LOGICAL_H_MM);
  }
  finalDoc.deletePage(1);

  report('Finalizing…');
  const safeName = sanitizeForPDF(journey.title || 'journey') || 'journey';
  finalDoc.save(`${safeName}.pdf`);
}
