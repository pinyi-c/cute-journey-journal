import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useJourney } from '@/lib/journeyContext';
import { BottomNav } from '@/components/BottomNav';
import { exportPdf } from '@/lib/exportPdf';
import { exportIgStory } from '@/lib/exportStory';
import { getPhotoUrl } from '@/lib/photoDb';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import mascotUrl from '@/assets/mascot.svg';
import { FileDown, Share2 } from 'lucide-react';

export default function Summary() {
  const { journey } = useJourney();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingIg, setExportingIg] = useState(false);
  const [collageUrls, setCollageUrls] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  if (!journey) return <Navigate to="/" replace />;

  const completed = journey.challenges.filter(c => c.completed).length;
  const total = journey.challenges.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handlePdfExport = async () => {
    setExportingPdf(true);
    try {
      await exportPdf(journey);
    } catch (e) {
      console.error('PDF export failed:', e);
    }
    setExportingPdf(false);
  };

  const handleStoryExport = async () => {
    setExportingIg(true);
    try {
      await exportIgStory(journey);
    } catch (e) {
      console.error('Story export failed:', e);
    }
    setExportingIg(false);
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

      <div className="mx-4 space-y-3">
        <h2 className="font-bold">Export Your Journey</h2>
        <button onClick={handlePdfExport} disabled={exportingPdf || completed === 0}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm active:scale-[0.98] transition-transform">
          <FileDown size={18} /> {exportingPdf ? 'Generating PDF…' : 'Export PDF Booklet'}
        </button>
        <button onClick={handleStoryExport} disabled={exportingIg || completed === 0}
          className="w-full bg-accent text-accent-foreground rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm active:scale-[0.98] transition-transform">
          <Share2 size={18} /> {exportingIg ? 'Generating IG images…' : 'Export IG Story (3 PNGs)'}
        </button>
        {completed === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Complete at least one challenge to export your journey.
          </p>
        )}
        <p className="text-xs text-muted-foreground text-center">
          PDF supports Chinese text if NotoSansTC font is placed in /public/fonts/
        </p>
      </div>

      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <BottomNav />
    </div>
  );
}
