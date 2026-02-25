import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useJourney } from '@/lib/journeyContext';
import { ChallengeItem } from '@/components/ChallengeItem';
import { BottomNav } from '@/components/BottomNav';
import mascotUrl from '@/assets/mascot.svg';
import { Plus } from 'lucide-react';

export default function Challenges() {
  const { journey, addChallenge } = useJourney();
  const [newTitle, setNewTitle] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  if (!journey) return <Navigate to="/" replace />;

  const completed = journey.challenges.filter(c => c.completed).length;
  const total = journey.challenges.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAdd = () => {
    if (newTitle.trim()) {
      addChallenge(newTitle.trim());
      setNewTitle('');
      setShowAdd(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold truncate">{journey.title}</h1>
          <p className="text-xs text-muted-foreground">
            {completed}/{total} completed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <button
            onClick={() => navigate('/', { state: { edit: true } })}
            className="text-xs font-semibold text-primary underline underline-offset-2"
          >
            Edit Journey
          </button>
          <img src={mascotUrl} alt="Mascot" className="w-10 h-10" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-4">
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-right">{pct}%</p>
      </div>

      {/* Challenge list */}
      <div className="px-4 space-y-3">
        {journey.challenges.map(c => (
          <ChallengeItem key={c.id} challenge={c} />
        ))}
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
