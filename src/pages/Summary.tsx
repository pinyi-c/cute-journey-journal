import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useJourney } from '@/lib/journeyContext';
import { BottomNav } from '@/components/BottomNav';
import { exportPdf } from '@/lib/exportPdf';
import { sortChallenges } from '@/lib/sortChallenges';
import type { SortOption } from '@/lib/sortChallenges';
import { getPhotoUrl, deletePhoto } from '@/lib/photoDb';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import { FileDown, Loader2, Plus, X } from 'lucide-react';
import { setPendingCrop } from '@/lib/cropStore';

type EntryOrderOption = 'same-as-journal' | 'date-asc' | 'date-desc';
type CoverTitleOption = 'journey' | 'custom';

export default function Summary() {
  const navigate = useNavigate();
  const { journey, updateJourneyDetails, lastJournalSortMode } = useJourney();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgressMessage, setPdfProgressMessage] = useState('');
  const [collageUrls, setCollageUrls] = useState<string[]>([]);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [entryOrder, setEntryOrder] = useState<EntryOrderOption>('same-as-journal');
  const [backgroundTheme, setBackgroundTheme] = useState(true);
  const [coverTitleOption, setCoverTitleOption] = useState<CoverTitleOption>('journey');
  const [customCoverTitle, setCustomCoverTitle] = useState('');

  useEffect(() => {
    if (!journey) return;
    const photoIds = journey.challenges.flatMap(c => c.photoIds).slice(0, 6);
    let cancelled = false;
    const load = async () => {
      const urls: string[] = [];
      for (const id of photoIds) {
        const url = await getPhotoUrl(id);
        if (url && !cancelled) urls.push(url);
      }
      if (!cancelled) setCollageUrls(urls);
    };
    load();
    return () => { cancelled = true; };
  }, [journey]);

  useEffect(() => {
    const id = journey?.coverPhotoId;
    if (!id) {
      setCoverPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const load = async () => {
      const url = await getPhotoUrl(id);
      if (url && !cancelled) {
        objectUrl = url;
        setCoverPreviewUrl(url);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [journey?.coverPhotoId]);

  if (!journey) return <Navigate to="/" replace />;

  const total = journey.challenges.length;

  const handlePdfExport = async () => {
    if (!journey) return;
    setExportingPdf(true);
    setPdfProgressMessage('Preparing…');
    try {
      const sortForOrder: SortOption = entryOrder === 'same-as-journal' ? lastJournalSortMode : entryOrder === 'date-asc' ? 'date-asc' : 'date-desc';
      const orderedChallenges = sortChallenges(journey.challenges, sortForOrder);
      await exportPdf(
        journey,
        (message) => setPdfProgressMessage(message),
        journey.coverPhotoId ?? undefined,
        {
          orderedChallenges,
          useThemeBackground: backgroundTheme,
          coverTitle: coverTitleOption === 'custom' ? (customCoverTitle.trim().slice(0, 40) || undefined) : undefined,
        },
      );
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExportingPdf(false);
      setPdfProgressMessage('');
    }
  };

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto">
      <div className="p-4">
        <h1 className="text-xl font-extrabold">Export PDF</h1>
        <p className="text-xs text-slate-600 mt-0.5">Export PDF booklet</p>
      </div>

      {collageUrls.length > 0 && (
        <div className="mx-4 mb-6">
          <h2 className="font-bold mb-3">Highlight Collage 📸</h2>
          <div className="grid grid-cols-3 gap-2">
            {collageUrls.map((url, i) => (
              <img key={i} src={url} alt={`Collage ${i + 1}`}
                className="rounded-xl w-full aspect-square object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewUrl(url)} />
            ))}
          </div>
        </div>
      )}

      <div className="mx-4 mb-6">
        <h2 className="font-bold mb-3">PDF Cover Photo</h2>
        <p className="text-xs text-slate-600 mb-2">
          Optional: upload a dedicated cover photo for the booklet. It will be cropped to portrait (4:5).
        </p>
        <div className="flex flex-wrap items-start gap-3">
          {journey.coverPhotoId && coverPreviewUrl ? (
            <>
              <div className="relative w-24 aspect-[4/5] rounded-xl border border-border overflow-hidden bg-muted/30 flex-shrink-0">
                <img
                  src={coverPreviewUrl}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    deletePhoto(journey.coverPhotoId!);
                    updateJourneyDetails({ coverPhotoId: null });
                  }}
                  className="text-sm text-slate-600 hover:text-destructive flex items-center gap-1"
                >
                  <X size={14} /> Remove
                </button>
              </div>
            </>
          ) : (
            <label className="flex flex-col items-center justify-center w-24 rounded-xl border-2 border-dashed border-primary/40 flex-shrink-0 cursor-pointer hover:border-primary/70 transition-colors aspect-[4/5]">
              <Plus size={28} className="text-slate-500" />
              <span className="text-xs font-medium text-slate-600 mt-1">Upload</span>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPendingCrop({ file, coverPhoto: true });
                  navigate('/crop');
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="mx-4 space-y-3">
        <h2 className="font-bold">Export settings</h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Entry order</label>
            <select
              value={entryOrder}
              onChange={(e) => setEntryOrder(e.target.value as EntryOrderOption)}
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="same-as-journal">Same as Logbook (current view)</option>
              <option value="date-asc">Date: Old → New</option>
              <option value="date-desc">Date: New → Old</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Background</label>
            <select
              value={backgroundTheme ? 'theme' : 'default'}
              onChange={(e) => setBackgroundTheme(e.target.value === 'theme')}
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="theme">Follow current theme</option>
              <option value="default">Default cream</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-2">Cover title</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="coverTitle"
                  checked={coverTitleOption === 'journey'}
                  onChange={() => setCoverTitleOption('journey')}
                  className="rounded-full border-border"
                />
                <span className="text-sm">Use logbook title</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="coverTitle"
                  checked={coverTitleOption === 'custom'}
                  onChange={() => setCoverTitleOption('custom')}
                  className="rounded-full border-border"
                />
                <span className="text-sm">Custom title</span>
              </label>
              {coverTitleOption === 'custom' && (
                <input
                  type="text"
                  value={customCoverTitle}
                  onChange={(e) => setCustomCoverTitle(e.target.value.slice(0, 40))}
                  placeholder="Enter cover title (max 40 chars)"
                  maxLength={40}
                  className="w-full mt-1 text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
          </div>
        </div>

        <h2 className="font-bold pt-2">Export PDF</h2>
        <button
          onClick={handlePdfExport}
          disabled={exportingPdf || total === 0}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm active:scale-[0.98] transition-transform"
        >
          {exportingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
          Export PDF
        </button>
        {total === 0 && (
          <p className="text-xs text-slate-600 text-center">
            Add at least one entry to export your PDF.
          </p>
        )}
      </div>

      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      {exportingPdf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          aria-modal="true"
          aria-busy="true"
          aria-label="Exporting PDF"
        >
          <div className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-slate-900">Exporting PDF</p>
            <p className="min-h-[1.25rem] text-center text-xs text-slate-600">
              {pdfProgressMessage || 'Preparing…'}
            </p>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
