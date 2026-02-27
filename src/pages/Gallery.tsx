import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useJourney } from '@/lib/journeyContext';
import { BottomNav } from '@/components/BottomNav';
import { getPhotoUrl } from '@/lib/photoDb';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';

type Filter = 'all' | 'completed' | 'pending';

export default function Gallery() {
  const { journey } = useJourney();
  const [filter, setFilter] = useState<Filter>('all');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  if (!journey) return <Navigate to="/" replace />;

  const filtered = journey.challenges.filter(c => {
    if (filter === 'completed') return c.completed;
    if (filter === 'pending') return !c.completed;
    return true;
  });

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto">
      <div className="p-4">
        <h1 className="text-xl font-extrabold mb-4">Gallery 📸</h1>
        <div className="flex gap-2 mb-4">
          {(['all', 'completed', 'pending'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-4">
        {filtered.map(c => (
          <div key={c.id} className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  c.completed ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
              <h3 className="font-bold text-sm">{c.title}</h3>
            </div>
            {c.caption && (
              <p className="text-sm text-muted-foreground mb-2">{c.caption}</p>
            )}
            {(c.date || c.location) && (
              <p className="text-xs text-muted-foreground mb-2">
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
                  <p className="text-xs text-muted-foreground">
                    +{c.photoIds.length - 6} more
                  </p>
                )}
              </div>
            )}
            {c.photoIds.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic">No photos yet</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No challenges found for this filter 🤔
          </p>
        )}
      </div>

      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <BottomNav />
    </div>
  );
}
