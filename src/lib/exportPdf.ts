import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';
import { cropImageToDataURL } from './imageUtils';

function safeTitleForPDF(text: string): string {
  // Strip leading checkbox-style markers like "[x] " or "[ ] "
  const withoutCheckbox = text.replace(/^\s*\[(x|X| )\]\s*/u, '');
  // Strip emojis and other symbols not covered by our embedded CJK font.
  // This keeps PDF text stable even when titles contain emoji.
  return withoutCheckbox.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '');
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
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
    const lines = doc.splitTextToSize(challenge.caption, maxWidth) as string[];
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
  // We try Noto Sans CJK JP first, then fall back to Noto Sans TC.
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
      const binary = arrayBufferToBinaryString(buffer);
      doc.addFileToVFS(fileName, binary);
      doc.addFont(fileName, fontName, 'normal');
      doc.setFont(fontName);
      fontLoaded = true;
      activeFontName = fontName;
    } catch (e) {
      console.error(`Error while fetching PDF font "${url}":`, e);
    }
  };

  // These files should be placed under /public/fonts/
  await tryLoadFont('/fonts/NotoSansCJKjp-Regular.otf', 'NotoSansCJKjp-Regular.otf', 'NotoSansCJKjp');

  if (!fontLoaded) {
    await tryLoadFont('/fonts/NotoSansTC-Regular.ttf', 'NotoSansTC-Regular.ttf', 'NotoSansTC');
  }

  if (!fontLoaded) {
    console.error(
      'PDF export: no CJK font could be loaded from /public/fonts/. Text may appear garbled.'
    );
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 40;

  // Cover page
  if (activeFontName) {
    doc.setFont(activeFontName);
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
      doc.setFont(activeFontName);
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
          doc.setFont(activeFontName);
        }
        y = marginTop;
        doc.setFontSize(12);
        doc.text(`${group.label} (cont.)`, margin, y);
        y += 8;
      } else if (isFirstPageForGroup && ensureSpace(doc, blockHeight, marginTop, marginBottom, y)) {
        // Extremely full first page: start fresh with "(cont.)"
        doc.addPage();
        if (activeFontName) {
          doc.setFont(activeFontName);
        }
        y = marginTop;
        doc.setFontSize(12);
        doc.text(`${group.label} (cont.)`, margin, y);
        y += 8;
      }

      isFirstPageForGroup = false;

      // Title
      doc.setFontSize(16);
      doc.text(safeTitleForPDF(challenge.title), margin, y);
      y += 10;

      // Caption
      if (challenge.caption) {
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(challenge.caption, pageWidth - 2 * margin);
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
              doc.addImage(dataUrl, 'JPEG', x, y, photoSize, photoSize);
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

  doc.save(`${journey.title}.pdf`);
}
