import { Journey } from './journeyContext';
import { getPhoto, blobToDataUrl } from './photoDb';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function exportPdf(journey: Journey) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Try to load Noto Sans TC for Chinese support
  try {
    const resp = await fetch('/fonts/NotoSansTC-Regular.ttf');
    if (resp.ok) {
      const buffer = await resp.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      doc.addFileToVFS('NotoSansTC-Regular.ttf', base64);
      doc.addFont('NotoSansTC-Regular.ttf', 'NotoSansTC', 'normal');
      doc.setFont('NotoSansTC');
    }
  } catch {
    // fallback to helvetica
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 40;

  // Cover page
  doc.setFontSize(22);
  doc.text(journey.title, pageWidth / 2, y, { align: 'center' });
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
    doc.setFontSize(16);
    doc.text(`${challenge.completed ? '✅' : '⬜'} ${challenge.title}`, margin, y);
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
