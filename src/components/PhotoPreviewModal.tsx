import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useJourney } from '@/lib/journeyContext';
import { getPhoto, getPhotoIdForUrl } from '@/lib/photoDb';
import { useMemo, useState } from 'react';

interface Props {
  url: string | null;
  onClose: () => void;
}

export function PhotoPreviewModal({ url, onClose }: Props) {
  const { journey } = useJourney();
  const [downloading, setDownloading] = useState(false);

  const downloadInfo = useMemo(() => {
    if (!url || !journey) return null;
    const photoId = getPhotoIdForUrl(url);
    if (!photoId) return null;
    const challenge = journey.challenges.find(c => c.photoIds.includes(photoId)) ?? null;
    const index = challenge ? challenge.photoIds.indexOf(photoId) + 1 : 1;
    return {
      photoId,
      journeyTitle: journey.title,
      challengeTitle: challenge?.title ?? 'challenge',
      index,
    };
  }, [url, journey]);

  const sanitize = (s: string) =>
    s
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'untitled';

  const handleDownload = async () => {
    if (!downloadInfo || downloading) return;
    setDownloading(true);
    try {
      const blob = await getPhoto(downloadInfo.photoId);
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      const filename = `${sanitize(downloadInfo.journeyTitle)}_${sanitize(downloadInfo.challengeTitle)}_${downloadInfo.index}.jpg`;

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Give iOS Safari a moment to consume the blob URL.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={!!url} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex flex-col items-center justify-center gap-2">
        {url && (
          <img
            src={url}
            alt="Preview"
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        )}
        <div className="w-full flex justify-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!downloadInfo || downloading}
            className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
