import { useEffect, useMemo, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { useNavigate } from 'react-router-dom';
import { consumePendingCrop } from '@/lib/cropStore';
import { useJourney } from '@/lib/journeyContext';
import { savePhoto } from '@/lib/photoDb';
import { MAX_PHOTOS_PER_CHALLENGE, COVER_PHOTO_ID } from '@/lib/constants';

async function getCroppedImageFromFile(
  file: File,
  croppedAreaPixels: Area,
  outWidth: number,
  outHeight?: number,
): Promise<Blob> {
  const h = outHeight ?? outWidth;
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const { x, y, width, height } = croppedAreaPixels;

    ctx.drawImage(img, x, y, width, height, 0, 0, outWidth, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (!blob) return reject(new Error('Crop failed'));
          resolve(blob);
        },
        'image/jpeg',
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

const COVER_ASPECT = 4 / 5;

export default function CropPage() {
  const navigate = useNavigate();
  const { journey, updateChallenge, updateJourneyDetails } = useJourney();
  const initial = useMemo(() => consumePendingCrop(), []);
  const [file] = useState<File | null>(initial?.file ?? null);
  const challengeId = initial && 'challengeId' in initial ? initial.challengeId : null;
  const isCoverMode = Boolean(initial && 'coverPhoto' in initial && initial.coverPhoto);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!file || !journey) {
      navigate(isCoverMode ? '/summary' : '/challenges', { replace: true });
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, journey, navigate, isCoverMode]);

  const handleCancel = () => {
    if (isCoverMode) {
      navigate('/summary', { replace: true });
    } else if (challengeId) {
      navigate(`/challenges?focus=${encodeURIComponent(challengeId)}`, { replace: true });
    } else {
      navigate('/challenges', { replace: true });
    }
  };

  const handleUsePhoto = async () => {
    if (!file || !croppedAreaPixels || !journey) return;
    if (isCoverMode) {
      const blob = await getCroppedImageFromFile(
        file,
        croppedAreaPixels,
        1280,
        1600,
      );
      await savePhoto(COVER_PHOTO_ID, blob);
      updateJourneyDetails({ coverPhotoId: COVER_PHOTO_ID });
      navigate('/summary', { replace: true });
      return;
    }
    if (!challengeId) return;
    const challenge = journey.challenges.find(c => c.id === challengeId);
    if (!challenge) {
      navigate('/challenges', { replace: true });
      return;
    }
    if (challenge.photoIds.length >= MAX_PHOTOS_PER_CHALLENGE) {
      navigate(`/challenges?focus=${encodeURIComponent(challengeId)}`, { replace: true });
      return;
    }
    const blob = await getCroppedImageFromFile(file, croppedAreaPixels, 1600);
    const id = crypto.randomUUID();
    await savePhoto(id, blob);
    updateChallenge(challengeId, { photoIds: [...challenge.photoIds, id] });
    navigate(`/challenges?focus=${encodeURIComponent(challengeId)}`, { replace: true });
  };

  if (!file || (!challengeId && !isCoverMode)) {
    return null;
  }

  const aspect = isCoverMode ? COVER_ASPECT : 1;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-4 pt-4 pb-2 flex items-center justify-between max-w-md mx-auto w-full">
        <button
          type="button"
          className="text-sm text-muted-foreground"
          onClick={handleCancel}
        >
          Back
        </button>
        <p className="text-xs text-muted-foreground">
          {isCoverMode ? 'Crop cover photo' : 'Crop your photo'}
        </p>
        <span className="w-10" />
      </header>

      <main className="flex-1 flex flex-col max-w-md mx-auto w-full">
        <div
          className="relative w-full bg-black rounded-xl overflow-hidden"
          style={{ aspectRatio: aspect }}
        >
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
            />
          )}
        </div>

        <div className="mt-4 px-4 pb-6 flex flex-col gap-4 w-full">
          <div className="flex items-center justify-center">
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-40"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-full border text-sm text-muted-foreground"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUsePhoto}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
            >
              Use Photo
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

