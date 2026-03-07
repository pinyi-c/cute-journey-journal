import { useState, useRef, useCallback, useEffect } from 'react';
import { Challenge, useJourney } from '@/lib/journeyContext';
import { PhotoUpload } from './PhotoUpload';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronUp, Trash2, Pencil, GripVertical } from 'lucide-react';
import { deletePhoto } from '@/lib/photoDb';
import { useLang } from '@/lib/i18n';
import { INPUT_FIELD_CLASSES, TEXTAREA_FIELD_CLASSES } from '@/lib/constants';

const REVEAL_WIDTH = 72;
const SWIPE_THRESHOLD = 10;
const VERTICAL_THRESHOLD = 24;

interface Props {
  challenge: Challenge;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** When provided, attach to the drag handle so only the handle starts drag. */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  /** When true, show grip but dimmed and non-draggable (e.g. when Sort is Date-based). */
  dragHandleDisabled?: boolean;
}

export function ChallengeItem({ challenge, isExpanded, onToggleExpand, dragHandleProps, dragHandleDisabled }: Props) {
  const { updateChallenge, deleteChallenge } = useJourney();
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(challenge.title);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);
  const slideRef = useRef<HTMLDivElement>(null);

  const handleTitleSave = () => {
    setEditing(false);
    if (title.trim()) {
      updateChallenge(challenge.id, { title: title.trim() });
    } else {
      setTitle(challenge.title);
    }
  };

  const handleDelete = useCallback(async () => {
    setShowDeleteDialog(false);
    setSwipeOffset(0);
    for (const pid of challenge.photoIds) {
      await deletePhoto(pid);
    }
    deleteChallenge(challenge.id);
  }, [challenge.id, challenge.photoIds, deleteChallenge]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest('[data-drag-handle]')) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
      isSwipingRef.current = false;
    },
    [],
  );
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      if (!isSwipingRef.current) {
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < VERTICAL_THRESHOLD) {
          isSwipingRef.current = true;
        } else if (Math.abs(dy) > VERTICAL_THRESHOLD) {
          touchStartRef.current = null;
          return;
        }
      }
      if (isSwipingRef.current) {
        e.preventDefault();
        const next = dx > 0 ? 0 : Math.max(-REVEAL_WIDTH, dx);
        setSwipeOffset(next);
      }
    },
    [],
  );
  const onTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    if (isSwipingRef.current) {
      setSwipeOffset((prev) => (prev < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
    }
    touchStartRef.current = null;
    isSwipingRef.current = false;
  }, []);

  // Non-passive touchmove so we can preventDefault when swiping (Mobile Safari)
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (!touchStartRef.current || !isSwipingRef.current) return;
      e.preventDefault();
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl">
        {/* Swipe-reveal trash area */}
        <div
          className="absolute right-0 top-0 bottom-0 z-0 flex items-center justify-center rounded-r-2xl bg-destructive/10"
          style={{ width: REVEAL_WIDTH }}
          aria-hidden
        >
          <button
            type="button"
            onClick={() => {
              setShowDeleteDialog(true);
              setSwipeOffset(0);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/20 text-destructive touch-manipulation active:bg-destructive/30"
            aria-label="Delete entry"
          >
            <Trash2 size={20} />
          </button>
        </div>

        {/* Sliding card content */}
        <div
          ref={slideRef}
          className="relative z-10 rounded-2xl border border-border bg-card shadow-sm transition-transform duration-150 ease-out"
          style={{ transform: `translateX(${swipeOffset}px)` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 p-3 cursor-pointer"
            onClick={() => !editing && onToggleExpand()}
          >
            <div
              {...(dragHandleProps && !dragHandleDisabled ? dragHandleProps : {})}
              data-drag-handle
              className={`flex items-center justify-center flex-shrink-0 touch-manipulation rounded p-2 -m-2 ${
                dragHandleDisabled
                  ? 'text-slate-400 cursor-default pointer-events-none select-none'
                  : dragHandleProps
                    ? 'text-slate-500 hover:text-slate-800 cursor-grab active:cursor-grabbing'
                    : 'text-slate-400 cursor-default pointer-events-none select-none'
              }`}
              aria-label={dragHandleDisabled || !dragHandleProps ? 'Reorder in Logbook (Custom Order)' : 'Drag to reorder'}
            >
              <GripVertical size={18} />
            </div>

        {editing ? (
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
            className="flex-1 min-w-0 bg-transparent border-b-2 border-primary outline-none font-semibold text-sm"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div className="relative flex-1 min-w-0">
            <span className="block pr-8 font-semibold text-sm select-none truncate">
              {challenge.title}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-slate-600 hover:text-slate-900 hover:bg-muted/50 transition-colors touch-manipulation"
              aria-label="Edit title"
            >
              <Pencil size={16} />
            </button>
          </div>
        )}

        {challenge.photoIds.length > 0 && (
          <span className="text-xs bg-secondary text-slate-700 px-2 py-0.5 rounded-full">
            📷 {challenge.photoIds.length}
          </span>
        )}

        {isExpanded ? (
          <ChevronUp size={16} className="text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-slate-500 flex-shrink-0" />
        )}
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <div>
            <label className="text-xs text-slate-600 font-medium">Notes / Caption</label>
            <textarea
              value={challenge.caption}
              onChange={e => updateChallenge(challenge.id, { caption: e.target.value })}
              placeholder="Write something cute..."
              className={TEXTAREA_FIELD_CLASSES}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex-1">
              <label className="text-xs text-slate-600 font-medium">Date</label>
              <input
                type="date"
                value={challenge.date}
                onChange={e => updateChallenge(challenge.id, { date: e.target.value })}
                className={INPUT_FIELD_CLASSES}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-600 font-medium">Location</label>
              <input
                value={challenge.location}
                onChange={e => updateChallenge(challenge.id, { location: e.target.value })}
                placeholder="📍 Where?"
                className={INPUT_FIELD_CLASSES}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium mb-1 block">
              Photos (max 10)
            </label>
            <PhotoUpload
              photoIds={challenge.photoIds}
              onPhotoIdsChange={(ids) => updateChallenge(challenge.id, { photoIds: ids })}
              challengeId={challenge.id}
            />
          </div>
        </div>
      )}
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.deleteEntryConfirm')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
