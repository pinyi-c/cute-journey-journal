import { useEffect, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Props {
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

async function getCroppedImage(
  file: File,
  croppedAreaPixels: Area,
  size = 1024,
): Promise<Blob> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const { x, y, width, height } = croppedAreaPixels;

    ctx.drawImage(
      img,
      x,
      y,
      width,
      height,
      0,
      0,
      size,
      size,
    );

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (!blob) return reject(new Error('Crop failed'));
          resolve(blob);
        },
        'image/jpeg',
        0.9,
      );
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function PhotoCropModal({ file, onCancel, onConfirm }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleUsePhoto = async () => {
    if (!file || !croppedAreaPixels) return;
    const blob = await getCroppedImage(file, croppedAreaPixels);
    onConfirm(blob);
  };

  return (
    <Dialog open={!!file} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent
        className="fixed inset-0 z-50 w-full max-w-none p-0 flex flex-col bg-background border-0 sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-md sm:rounded-lg sm:border sm:h-[90vh] h-[100dvh]"
        style={{ height: '100dvh' }}
      >
        <div className="flex-1 min-h-0 relative bg-black">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
            />
          )}
        </div>
        <div
          className="flex-shrink-0 w-full p-3 flex items-center justify-between border-t bg-background/95 backdrop-blur-sm"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            className="text-sm text-muted-foreground"
            onClick={onCancel}
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-24"
            />
            <button
              type="button"
              onClick={handleUsePhoto}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
            >
              Use Photo
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

