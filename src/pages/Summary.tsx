import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useJourney } from '@/lib/journeyContext';
import { BottomNav } from '@/components/BottomNav';
import { exportPdf } from '@/lib/exportPdf';
import { getPhotoUrl, deletePhoto } from '@/lib/photoDb';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import mascotUrl from '@/assets/mascot.svg';
import { FileDown, Loader2, Plus, X } from 'lucide-react';
import { setPendingCrop } from '@/lib/cropStore';

export default function Summary() {
  const navigate = useNavigate();
  const { journey, updateJourneyDetails } = useJourney();
  const [exportingPdfShort, setExportingPdfShort] = useState(false);
  const [exportingPdfLong, setExportingPdfLong] = useState(false);
  const [pdfProgressMessage, setPdfProgressMessage] = useState('');
  const [collageUrls, setCollageUrls] = useState<string[]>([]);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

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

  const completed = journey.challenges.filter(c => c.completed).length;
  const total = journey.challenges.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handlePdfExport = async (flipMode: 'short' | 'long') => {
    if (!journey) return;
    if (flipMode === 'short') setExportingPdfShort(true);
    else setExportingPdfLong(true);
    setPdfProgressMessage('Preparing…');
    try {
      await exportPdf(
        journey,
        (message) => setPdfProgressMessage(message),
        journey.coverPhotoId ?? undefined,
        flipMode,
      );
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      if (flipMode === 'short') setExportingPdfShort(false);
      else setExportingPdfLong(false);
      setPdfProgressMessage('');
    }
  };

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto">
      <div className="p-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Summary ✨</h1>
        <img src={mascotUrl} alt="Mascot" className="w-10 h-10" />
      </div>

      <div className="mx-4 bg-card rounded-2xl border border-border p-6 text-center mb-6 shadow-sm">
        <div className="text-5xl font-extrabold text-primary mb-2">{pct}%</div>
        <p className="text-muted-foreground text-sm">{completed} of {total} challenges completed</p>
        <div className="mt-4 h-3 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
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
        <p className="text-xs text-muted-foreground mb-2">
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
                  className="text-sm text-muted-foreground hover:text-destructive flex items-center gap-1"
                >
                  <X size={14} /> Remove
                </button>
              </div>
            </>
          ) : (
            <label className="flex flex-col items-center justify-center w-24 rounded-xl border-2 border-dashed border-primary/40 flex-shrink-0 cursor-pointer hover:border-primary/70 transition-colors aspect-[4/5]">
              <Plus size={28} className="text-primary/50" />
              <span className="text-xs font-medium text-muted-foreground mt-1">Upload</span>
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
        <h2 className="font-bold">Export Your Journey</h2>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handlePdfExport('short')}
            disabled={exportingPdfShort || exportingPdfLong || completed === 0}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm active:scale-[0.98] transition-transform"
          >
            {exportingPdfShort ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
            Export Booklet (Short-edge flip)
          </button>
          <button
            onClick={() => handlePdfExport('long')}
            disabled={exportingPdfShort || exportingPdfLong || completed === 0}
            className="w-full bg-primary/90 text-primary-foreground rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm active:scale-[0.98] transition-transform"
          >
            {exportingPdfLong ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
            Export Booklet (Long-edge flip)
          </button>
        </div>
        {completed === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Complete at least one challenge to export your journey.
          </p>
        )}
      </div>

      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      {(exportingPdfShort || exportingPdfLong) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          aria-modal="true"
          aria-busy="true"
          aria-label="Exporting PDF"
        >
          <div className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Exporting PDF</p>
            <p className="min-h-[1.25rem] text-center text-xs text-muted-foreground">
              {pdfProgressMessage || 'Preparing…'}
            </p>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
