import { useState } from 'react';
import { Challenge, useJourney } from '@/lib/journeyContext';
import { PhotoUpload } from './PhotoUpload';
import { ChevronDown, ChevronUp, Trash2, Check, Pencil } from 'lucide-react';
import { deletePhoto } from '@/lib/photoDb';
import { INPUT_FIELD_CLASSES, TEXTAREA_FIELD_CLASSES } from '@/lib/constants';

interface Props {
  challenge: Challenge;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function ChallengeItem({ challenge, isExpanded, onToggleExpand }: Props) {
  const { updateChallenge, deleteChallenge } = useJourney();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(challenge.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleTitleSave = () => {
    setEditing(false);
    if (title.trim()) {
      updateChallenge(challenge.id, { title: title.trim() });
    } else {
      setTitle(challenge.title);
    }
  };

  const handleDelete = async () => {
    for (const pid of challenge.photoIds) {
      await deletePhoto(pid);
    }
    deleteChallenge(challenge.id);
  };

  return (
    <div
      className={`rounded-2xl border bg-card shadow-sm transition-all ${
        challenge.completed ? 'border-primary/30 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => !editing && onToggleExpand()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateChallenge(challenge.id, { completed: !challenge.completed });
          }}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            challenge.completed
              ? 'bg-primary border-primary'
              : 'border-muted-foreground/40 hover:border-primary/60'
          }`}
        >
          {challenge.completed && <Check size={14} className="text-primary-foreground" />}
        </button>

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
            <span
              className={`block pr-8 font-semibold text-sm select-none truncate ${
                challenge.completed ? 'line-through text-muted-foreground' : ''
              }`}
            >
              {challenge.title}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors touch-manipulation"
              aria-label="Edit title"
            >
              <Pencil size={16} />
            </button>
          </div>
        )}

        {challenge.photoIds.length > 0 && (
          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
            📷 {challenge.photoIds.length}
          </span>
        )}

        {isExpanded ? (
          <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Notes / Caption</label>
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
              <label className="text-xs text-muted-foreground font-medium">Date</label>
              <input
                type="date"
                value={challenge.date}
                onChange={e => updateChallenge(challenge.id, { date: e.target.value })}
                className={INPUT_FIELD_CLASSES}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground font-medium">Location</label>
              <input
                value={challenge.location}
                onChange={e => updateChallenge(challenge.id, { location: e.target.value })}
                placeholder="📍 Where?"
                className={INPUT_FIELD_CLASSES}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Photos (max 10)
            </label>
            <PhotoUpload
              photoIds={challenge.photoIds}
              onPhotoIdsChange={(ids) => updateChallenge(challenge.id, { photoIds: ids })}
              challengeId={challenge.id}
            />
          </div>

          <div className="pt-2 border-t border-border">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive">Delete this challenge?</span>
                <button
                  onClick={handleDelete}
                  className="text-xs bg-destructive text-destructive-foreground px-3 py-1 rounded-full font-semibold"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-destructive/70 flex items-center gap-1 hover:text-destructive transition-colors"
              >
                <Trash2 size={12} /> Delete challenge
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
