import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';

// Strip emojis and other symbols not covered by our embedded CJK font.
// This keeps PDF text stable even when titles contain emoji.
function safeTitleForPDF(text: string): string {
  return text.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '');
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
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

  // Challenge pages
  for (const challenge of journey.challenges) {
    doc.addPage();
    y = 25;
    if (activeFontName) {
      doc.setFont(activeFontName);
    }
    doc.setFontSize(16);
    const statusPrefix = challenge.completed ? '[x] ' : '[ ] ';
    doc.text(statusPrefix + safeTitleForPDF(challenge.title), margin, y);
    y += 10;
    doc.setFontSize(10);
    if (challenge.date) {
      doc.text(`Date: ${challenge.date}`, margin, y);
      y += 6;
    }
    if (challenge.location) {
      doc.text(`Location: ${challenge.location}`, margin, y);
      y += 6;
    }
    if (challenge.caption) {
      y += 2;
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(challenge.caption, pageWidth - 2 * margin);
      doc.text(lines, margin, y);
      y += lines.length * 6;
    }

    for (const pid of challenge.photoIds) {
      const blob = await getPhoto(pid);
      if (blob) {
        try {
          const dataUrl = await blobToDataUrl(blob);
          if (y > 200) {
            doc.addPage();
            y = 25;
          }
          doc.addImage(dataUrl, 'JPEG', margin, y, 55, 55);
          y += 60;
        } catch { /* skip */ }
      }
    }
  }

  doc.save(`${journey.title}.pdf`);
}
