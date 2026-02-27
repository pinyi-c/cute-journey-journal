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
  let y = 40;

  // Cover page
  // Always ensure our embedded CJK font is active before any text.
  if (activeFontName) {
    doc.setFont(activeFontName, 'normal');
  }
  doc.setFontSize(22);
  doc.text(safeTitleForPDF(journey.title), pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.setFontSize(12);
  doc.text(
    `${journey.startDate}${journey.endDate ? ' – ' + journey.endDate : ''}`,
    pageWidth / 2, y, { align: 'center' }
  );
  y += 8;
  if (journey.buddyName) {
    doc.text(`with ${journey.buddyName}`, pageWidth / 2, y, { align: 'center' });
    y += 8;
  }
  y += 10;
  const completed = journey.challenges.filter(c => c.completed).length;
  doc.setFontSize(14);
  doc.text(
    `${completed} / ${journey.challenges.length} Challenges Completed`,
    pageWidth / 2, y, { align: 'center' }
  );

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
    y = marginTop;
    doc.setFontSize(14);
    doc.text(group.label, margin, y);
    y += 8;

    for (const challenge of group.challenges) {
      const blockHeight = estimateBlockHeight(doc, challenge, pageWidth, margin);

      if (!isFirstPageForGroup && ensureSpace(doc, blockHeight, marginTop, marginBottom, y)) {
        doc.addPage();
        if (activeFontName) {
          doc.setFont(activeFontName, 'normal');
        }
        y = marginTop;
        doc.setFontSize(12);
        doc.text(`${group.label} (cont.)`, margin, y);
        y += 8;
      } else if (isFirstPageForGroup && ensureSpace(doc, blockHeight, marginTop, marginBottom, y)) {
        // Extremely full first page: start fresh with "(cont.)"
        doc.addPage();
        if (activeFontName) {
          doc.setFont(activeFontName, 'normal');
        }
        y = marginTop;
        doc.setFontSize(12);
        doc.text(`${group.label} (cont.)`, margin, y);
        y += 8;
      }

      isFirstPageForGroup = false;

      // Title
      doc.setFontSize(16);
      if (activeFontName) {
        doc.setFont(activeFontName, 'normal');
      }
      doc.text(safeTitleForPDF(challenge.title), margin, y);
      y += 10;

      // Caption
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
        const lines = doc.splitTextToSize(cap, pageWidth - 2 * margin);
        y += 2;
        doc.text(lines, margin, y);
        y += (lines as string[]).length * 6;
      }

      // Photos (up to 3, in a horizontal strip)
      const photoIds = challenge.photoIds.slice(0, 3);
      if (photoIds.length > 0) {
        const photoSize = 40;
        const gap = 5;
        const totalWidth = photoIds.length * photoSize + (photoIds.length - 1) * gap;
        let x = margin;
        if (totalWidth < pageWidth - 2 * margin) {
          x = margin + (pageWidth - 2 * margin - totalWidth) / 2;
        }

        for (const pid of photoIds) {
          const blob = await getPhoto(pid);
          if (blob) {
            try {
              const originalDataUrl = await blobToDataURL(blob);
              const dataUrl = await cropImageToDataURL(originalDataUrl, photoSize, photoSize);
              const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
              doc.addImage(dataUrl, format, x, y, photoSize, photoSize);
            } catch {
              // skip this photo
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
