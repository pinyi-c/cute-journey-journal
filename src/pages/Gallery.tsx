import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { useJourney } from '@/lib/journeyContext';
import type { Challenge } from '@/lib/journeyContext';
import { sortChallenges, getDefaultSort } from '@/lib/sortChallenges';
import type { SortOption } from '@/lib/sortChallenges';
import { BottomNav } from '@/components/BottomNav';
import { useLang } from '@/lib/i18n';
import { getPhotoUrl, getPhoto, blobToDataUrl } from '@/lib/photoDb';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import { ChallengeCardCapture, CARD_CAPTURE_BG } from '@/components/ChallengeCardCapture';
import { MAX_PHOTOS_PER_CHALLENGE } from '@/lib/constants';
import { Download } from 'lucide-react';

function sanitizeFilename(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'card';
}

export default function Gallery() {
  const { journey } = useJourney();
  const { t } = useLang();
  const [sortBy, setSortBy] = useState<SortOption>(getDefaultSort());
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturingCard, setCapturingCard] = useState<{
    challenge: Challenge;
    imageDataUrls: string[];
  } | null>(null);
  const captureContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!journey) return;
    let cancelled = false;
    const allPhotoIds = journey.challenges.flatMap(c => c.photoIds);
    const load = async () => {
      const result: Record<string, string> = {};
      for (const id of allPhotoIds) {
        const url = await getPhotoUrl(id);
        if (url && !cancelled) result[id] = url;
      }
      if (!cancelled) setPhotoUrls(result);
    };
    load();
    return () => { cancelled = true; };
  }, [journey]);

  useEffect(() => {
    if (!capturingCard || !journey || !captureContainerRef.current) return;
    const el = captureContainerRef.current;
    const imgs = el.querySelectorAll('img');
    const waitImages = Array.from(imgs).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else img.onload = () => resolve();
        })
    );
    Promise.all(waitImages)
      .then(() => html2canvas(el, { scale: 2, backgroundColor: CARD_CAPTURE_BG }))
      .then((canvas) => {
        const filename = `${sanitizeFilename(journey.title)}_${sanitizeFilename(capturingCard.challenge.title)}_card.png`;
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 500);
        }, 'image/png');
      })
      .finally(() => setCapturingCard(null));
  }, [capturingCard, journey]);

  const handleDownloadCard = async (c: Challenge) => {
    const ids = c.photoIds.slice(0, MAX_PHOTOS_PER_CHALLENGE);
    const dataUrls: string[] = [];
    for (const id of ids) {
      const blob = await getPhoto(id);
      if (blob) dataUrls.push(await blobToDataUrl(blob));
    }
    setCapturingCard({ challenge: c, imageDataUrls: dataUrls });
  };

  if (!journey) return <Navigate to="/" replace />;

  const entriesCount = journey.challenges.length;
  const uniqueDates = new Set(
    journey.challenges.map(c => c.date).filter((d): d is string => Boolean(d)),
  ).size;
  const photosCount = journey.challenges.reduce((sum, c) => sum + c.photoIds.length, 0);

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto">
      <div className="p-4">
        <h1 className="text-xl font-extrabold mb-1">{t('tabs.snapshots')}</h1>
        <p className="text-xs text-slate-600 mb-4">{t('subtitle.snapshots')}</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl border border-border bg-primary/5 py-2.5 px-3 text-center">
            <div className="text-lg font-bold text-slate-900">{entriesCount}</div>
            <div className="text-[11px] text-slate-600 font-medium">Entries</div>
          </div>
          <div className="rounded-xl border border-border bg-primary/5 py-2.5 px-3 text-center">
            <div className="text-lg font-bold text-slate-900">{uniqueDates}</div>
            <div className="text-[11px] text-slate-600 font-medium">Days</div>
          </div>
          <div className="rounded-xl border border-border bg-primary/5 py-2.5 px-3 text-center">
            <div className="text-lg font-bold text-slate-900">{photosCount}</div>
            <div className="text-[11px] text-slate-600 font-medium">Photos</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 font-medium">{t('common.sortBy')}</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-sm rounded-lg border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="manual">{t('common.sameAsLogbookCustomOrder')}</option>
            <option value="date-desc">{t('common.dateNewToOld')}</option>
            <option value="date-asc">{t('common.dateOldToNew')}</option>
          </select>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {sortChallenges(journey.challenges, sortBy).map(c => (
          <div key={c.id} className="bg-card rounded-2xl border border-border p-4">
            <div className="mb-2">
              <h3 className="font-bold text-sm">{c.title}</h3>
            </div>
            {c.caption && (
              <p className="text-sm text-slate-600 mb-2">{c.caption}</p>
            )}
            {(c.date || c.location) && (
              <p className="text-xs text-slate-600 mb-2">
                {c.date && `📅 ${c.date} `}
                {c.location && `📍 ${c.location}`}
              </p>
            )}
            {c.photoIds.length > 0 && (
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-2">
                  {c.photoIds.slice(0, 6).map(
                    pid =>
                      photoUrls[pid] && (
                        <img
                          key={pid}
                          src={photoUrls[pid]}
                          alt={c.title}
                          className="rounded-xl w-full aspect-square object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewUrl(photoUrls[pid])}
                        />
                      )
                  )}
                </div>
                {c.photoIds.length > 6 && (
                  <p className="text-xs text-slate-600">
                    +{c.photoIds.length - 6} more
                  </p>
                )}
              </div>
            )}
            {c.photoIds.length === 0 && (
              <p className="text-xs text-slate-500 italic">No photos yet</p>
            )}
            <div className="mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => handleDownloadCard(c)}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                <Download size={16} />
                Download Card
              </button>
            </div>
          </div>
        ))}
        {journey.challenges.length === 0 && (
          <p className="text-center text-slate-600 py-8">
            No entries yet. Add entries in Logbook to see them here.
          </p>
        )}
      </div>

      {capturingCard && (
        <div
          style={{
            position: 'fixed',
            left: -9999,
            top: 0,
            zIndex: -1,
          }}
        >
          <ChallengeCardCapture
            ref={captureContainerRef}
            title={capturingCard.challenge.title}
            date={capturingCard.challenge.date}
            location={capturingCard.challenge.location}
            caption={capturingCard.challenge.caption}
            imageDataUrls={capturingCard.imageDataUrls}
          />
        </div>
      )}
      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <BottomNav />
    </div>
  );
}
