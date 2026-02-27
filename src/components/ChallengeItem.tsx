import { useState } from 'react';
import { Challenge, useJourney } from '@/lib/journeyContext';
import { PhotoUpload } from './PhotoUpload';
import { ChevronDown, ChevronUp, Trash2, Check } from 'lucide-react';
import { deletePhoto } from '@/lib/photoDb';

export function ChallengeItem({ challenge }: { challenge: Challenge }) {
  const { updateChallenge, deleteChallenge } = useJourney();
  const [expanded, setExpanded] = useState(false);
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
        onClick={() => !editing && setExpanded(!expanded)}
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
            className="flex-1 bg-transparent border-b-2 border-primary outline-none font-semibold text-sm"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className={`flex-1 font-semibold text-sm select-none ${
              challenge.completed ? 'line-through text-muted-foreground' : ''
            }`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {challenge.title}
          </span>
        )}

        {challenge.photoIds.length > 0 && (
          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
            📷 {challenge.photoIds.length}
          </span>
        )}

        {expanded ? (
          <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            💡 Double-tap title to edit
          </p>

          <div>
            <label className="text-xs text-muted-foreground font-medium">Notes / Caption</label>
            <textarea
              value={challenge.caption}
              onChange={e => updateChallenge(challenge.id, { caption: e.target.value })}
              placeholder="Write something cute..."
              className="w-full mt-1 p-2.5 rounded-xl bg-muted/50 border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground font-medium">Date</label>
              <input
                type="date"
                value={challenge.date}
                onChange={e => updateChallenge(challenge.id, { date: e.target.value })}
                className="w-full mt-1 p-2.5 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground font-medium">Location</label>
              <input
                value={challenge.location}
                onChange={e => updateChallenge(challenge.id, { location: e.target.value })}
                placeholder="📍 Where?"
                className="w-full mt-1 p-2.5 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Photos (max 3)
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
