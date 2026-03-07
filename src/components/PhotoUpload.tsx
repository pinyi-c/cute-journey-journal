import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { deletePhoto, getPhotoUrl } from '@/lib/photoDb';
import { PhotoPreviewModal } from './PhotoPreviewModal';
import { GripVertical, Plus, X } from 'lucide-react';
import { setPendingCrop } from '@/lib/cropStore';
import { toast } from '@/hooks/use-toast';
import { MAX_PHOTOS_PER_CHALLENGE } from '@/lib/constants';

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
    if (photoIds.length >= MAX_PHOTOS_PER_CHALLENGE) {
      toast({
        title: 'Photo limit reached',
        description: 'This challenge can have up to 10 photos.',
      });
      return;
    }
    setPendingCrop({ file, challengeId });
    navigate(`/crop?cid=${encodeURIComponent(challengeId)}`);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deletePhoto(id);
    onPhotoIdsChange(photoIds.filter(pid => pid !== id));
  };

  const onDragEnd = (result: DropResult) => {
    if (result.destination == null) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const reordered = [...photoIds];
    const [removed] = reordered.splice(from, 1);
    reordered.splice(to, 0, removed);
    onPhotoIdsChange(reordered);
  };

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 flex-nowrap">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId={`photos-${challengeId}`} direction="horizontal">
            {(droppableProvided) => (
              <div
                ref={droppableProvided.innerRef}
                {...droppableProvided.droppableProps}
                className="flex gap-2 flex-nowrap"
              >
                {photoIds.map((id, index) => (
                <Draggable key={id} draggableId={id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden border flex-shrink-0 transition-shadow ${
                        snapshot.isDragging
                          ? 'border-primary shadow-lg ring-2 ring-primary/30 z-10'
                          : 'border-border'
                      }`}
                    >
                      <div
                        {...provided.dragHandleProps}
                        className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center bg-black/30 z-[1] rounded-l-xl"
                        aria-label="Hold to reorder"
                      >
                        <GripVertical size={12} className="text-white" />
                      </div>
                      {urls[id] && (
                        <img
                          src={urls[id]}
                          alt="Challenge photo"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setPreviewUrl(urls[id])}
                        />
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRemove(e, id)}
                        className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center z-[2]"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {droppableProvided.placeholder}
            </div>
          )}
          </Droppable>
        </DragDropContext>
        {photoIds.length < MAX_PHOTOS_PER_CHALLENGE && (
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-primary/40 flex items-center justify-center cursor-pointer hover:border-primary/70 transition-colors flex-shrink-0">
            <Plus size={24} className="text-slate-500" />
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
      {photoIds.length >= MAX_PHOTOS_PER_CHALLENGE && (
        <p className="text-xs text-slate-600 mt-1">This challenge can have up to 10 photos. 📸</p>
      )}
      <PhotoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
