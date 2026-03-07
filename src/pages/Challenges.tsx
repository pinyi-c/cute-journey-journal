import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useJourney } from '@/lib/journeyContext';
import { ChallengeItem } from '@/components/ChallengeItem';
import { BottomNav } from '@/components/BottomNav';
import { sortChallenges, SORT_OPTIONS, getDefaultSort } from '@/lib/sortChallenges';
import type { SortOption } from '@/lib/sortChallenges';
import mascotUrl from '@/assets/mascot.svg';
import { Plus } from 'lucide-react';

export default function Challenges() {
  const { journey, addChallenge, reorderChallenges, saveNow } = useJourney();
  const [newTitle, setNewTitle] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [expandedChallengeId, setExpandedChallengeId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>(getDefaultSort());
  const navigate = useNavigate();
  const location = useLocation();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!journey) return <Navigate to="/" replace />;

  const handleAdd = () => {
    if (newTitle.trim()) {
      addChallenge(newTitle.trim());
      setNewTitle('');
      setShowAdd(false);
    }
  };

  const handleManualSave = () => {
    saveNow();
    setSaveStatus('Saved just now');
  };

  const onDragEnd = (result: DropResult) => {
    if (result.destination == null) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const list = journey.challenges;
    const reordered = [...list];
    const [removed] = reordered.splice(from, 1);
    reordered.splice(to, 0, removed);
    reorderChallenges(reordered);
  };

  const isManualSort = sortBy === 'manual';
  const displayedChallenges = isManualSort
    ? journey.challenges
    : sortChallenges(journey.challenges, sortBy);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const focus = params.get('focus');
    if (focus && journey.challenges.some(c => c.id === focus)) {
      setExpandedChallengeId(focus);
      requestAnimationFrame(() => {
        const el = itemRefs.current[focus];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      params.delete('focus');
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true },
      );
    }
  }, [location.pathname, location.search, journey.challenges, navigate]);

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold truncate">{journey.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Add/edit entries with photos</p>
        </div>
        <div className="flex flex-col items-center gap-2 flex-shrink-0 ml-3">
          <img src={mascotUrl} alt="Mascot" className="w-10 h-10" />
          <button
            onClick={() => navigate('/', { state: { edit: true } })}
            className="text-xs font-semibold text-primary underline underline-offset-2"
          >
            Edit Journey
          </button>
        </div>
      </div>

      {/* Manual save */}
      <div className="px-4 mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Auto-save is on.</span>
        <div className="flex items-center gap-2">
          {saveStatus && <span>{saveStatus}</span>}
          <button
            onClick={handleManualSave}
            className="px-3 py-1 rounded-full border border-border text-[11px] font-medium bg-background/80 hover:bg-muted transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Sort by */}
      <div className="px-4 mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="text-sm rounded-lg border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Challenge list */}
      <div className="px-4 space-y-3">
        {isManualSort ? (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="challenges">
              {(droppableProvided) => (
                <div
                  ref={droppableProvided.innerRef}
                  {...droppableProvided.droppableProps}
                  className="space-y-3"
                >
                  {displayedChallenges.map((c, index) => (
                    <Draggable key={c.id} draggableId={c.id} index={index}>
                      {(provided) => (
                        <div
                          ref={(el) => {
                            provided.innerRef(el);
                            if (el) itemRefs.current[c.id] = el;
                          }}
                          {...provided.draggableProps}
                        >
                          <ChallengeItem
                            challenge={c}
                            isExpanded={expandedChallengeId === c.id}
                            onToggleExpand={() =>
                              setExpandedChallengeId(prev => (prev === c.id ? null : c.id))
                            }
                            dragHandleProps={provided.dragHandleProps}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {droppableProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <>
            {displayedChallenges.map((c) => (
              <div
                key={c.id}
                ref={(el) => {
                  if (el) itemRefs.current[c.id] = el;
                }}
              >
                <ChallengeItem
                  challenge={c}
                  isExpanded={expandedChallengeId === c.id}
                  onToggleExpand={() =>
                    setExpandedChallengeId(prev => (prev === c.id ? null : c.id))
                  }
                />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add challenge */}
      <div className="px-4 mt-4">
        {showAdd ? (
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="New challenge title..."
              className="flex-1 p-3 rounded-2xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="bg-primary text-primary-foreground px-4 rounded-2xl font-semibold text-sm"
            >
              Add
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewTitle(''); }}
              className="text-muted-foreground px-2 text-lg"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary/70 font-semibold flex items-center justify-center gap-2 hover:border-primary/50 transition-colors active:scale-[0.98]"
          >
            <Plus size={18} /> Add Challenge
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
