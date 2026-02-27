import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { deletePhoto, getPhotoUrl } from '@/lib/photoDb';
import { PhotoPreviewModal } from './PhotoPreviewModal';
import { Plus, X } from 'lucide-react';
import { setPendingCrop } from '@/lib/cropStore';

interface Props {
  photoIds: string[];
  onPhotoIdsChange: (ids: string[]) => void;
  challengeId: string;
}

export function PhotoUpload({ photoIds, onPhotoIdsChange, challengeId }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result: Record<string, string> = {};
      for (const id of photoIds) {
        const url = await getPhotoUrl(id);
        if (url && !cancelled) result[id] = url;
      }
      if (!cancelled) setUrls(result);
    };
    load();
    return () => { cancelled = true; };
  }, [photoIds.join(',')]);

  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoIds.length >= 3) return;
    setPendingCrop({ file, challengeId });
    navigate('/crop');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = async (id: string) => {
    await deletePhoto(id);
    onPhotoIdsChange(photoIds.filter(pid => pid !== id));
  };

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {photoIds.map(id => (
          <div key={id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
            {urls[id] && (
              <img
                src={urls[id]}
                alt="Challenge photo"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setPreviewUrl(urls[id])}
              />
            )}
            <button
              onClick={() => handleRemove(id)}
              className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {photoIds.length < 3 && (
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-primary/40 flex items-center justify-center cursor-pointer hover:border-primary/70 transition-colors">
            <Plus size={24} className="text-primary/50" />
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAdd}
            />
          </label>
        )}
      </div>
      {photoIds.length >= 3 && (
        <p className="text-xs text-muted-foreground mt-1">Maximum 3 photos reached! 📸</p>
      )}
      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
