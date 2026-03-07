import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useJourney, ThemeId } from '@/lib/journeyContext';
import { ThemePicker } from '@/components/ThemePicker';
import { INPUT_FIELD_CLASSES } from '@/lib/constants';
import { clearAllPhotos } from '@/lib/photoDb';
import { Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OwnerAvatar } from '@/components/OwnerAvatar';

export default function Onboarding() {
  const { journey, createJourney, updateJourneyDetails, resetJourney } = useJourney();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(location.state && (location.state as { edit?: boolean }).edit && journey);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showNewJourneyConfirm, setShowNewJourneyConfirm] = useState(false);
  const [title, setTitle] = useState(
    journey ? journey.title : "Erina's Taipei Adventure Logbook",
  );
  const [startDate, setStartDate] = useState(journey ? journey.startDate : '');
  const [endDate, setEndDate] = useState(journey ? journey.endDate : '');
  const [buddyName, setBuddyName] = useState(journey ? journey.buddyName : '');
  const [theme, setTheme] = useState<ThemeId>(journey ? journey.theme : 'oat-latte');
  const [ownerName, setOwnerName] = useState(journey?.ownerName ?? 'Erina');
  const [showAddNameModal, setShowAddNameModal] = useState(false);
  const [addNameInput, setAddNameInput] = useState('');

  // Live preview: apply selected theme to DOM so background, inputs, picker, and button update instantly
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // If journey exists and user hasn't clicked "new", show continue screen
  if (journey && !showNewForm && !isEditing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-extrabold mb-2 text-center">Welcome back to Taiwan Logbook! 📓</h1>
        <p className="text-slate-600 mb-6 text-center">
          Your logbook: <strong className="text-foreground">{journey.title}</strong>
        </p>
        <button
          onClick={() => navigate('/challenges')}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-bold text-lg shadow-lg active:scale-[0.98] transition-transform"
        >
          Continue logbook
        </button>
        <button
          onClick={() => setShowNewJourneyConfirm(true)}
          className="mt-4 text-sm text-slate-600 underline"
        >
          Start a new logbook
        </button>

        <AlertDialog open={showNewJourneyConfirm} onOpenChange={setShowNewJourneyConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start a new logbook?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete your current logbook and all saved photos. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => {
                  e.preventDefault();
                  setShowNewJourneyConfirm(false);
                  await clearAllPhotos();
                  resetJourney();
                  setShowNewForm(true);
                }}
              >
                Start new
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  const handleStart = () => {
    if (!startDate) return;
    if (journey && isEditing) {
      updateJourneyDetails({ title, startDate, endDate, buddyName, theme, ownerName });
    } else {
      createJourney({ title, startDate, endDate, buddyName, theme, ownerName });
    }
    navigate('/challenges');
  };

  const displayName = ownerName.trim() || 'Erina';

  const handleSaveAddName = () => {
    const name = addNameInput.trim();
    if (!name) return;
    setOwnerName(name);
    setAddNameInput('');
    setShowAddNameModal(false);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-md mx-auto">
      <div className="flex flex-col items-center mb-6 pt-8">
        <h1 className="text-2xl font-extrabold text-center">Welcome to Taiwan!</h1>
        <p className="text-slate-600 text-sm mt-1">Tiny moments, big memories. 😋</p>
        <p className="text-xs text-slate-500 mt-4 mb-2">Who is this logbook for?</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setOwnerName(displayName)}
            className={`flex flex-col items-center gap-1.5 transition-all rounded-2xl p-2 min-w-[72px] ${
              (ownerName.trim() || 'Erina') === displayName
                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                : 'hover:bg-muted/60'
            }`}
          >
            <OwnerAvatar name={displayName} className="w-12 h-12 text-lg" alt={displayName} />
            <span className="text-xs font-medium text-foreground">{displayName}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAddNameInput('');
              setShowAddNameModal(true);
            }}
            className="flex flex-col items-center gap-1.5 rounded-2xl p-2 min-w-[72px] hover:bg-muted/60 transition-colors border border-dashed border-border"
          >
            <div className="w-12 h-12 rounded-full bg-muted/50 border border-dashed border-border flex items-center justify-center">
              <Plus size={20} className="text-slate-500" />
            </div>
            <span className="text-xs font-medium text-slate-600">Add</span>
          </button>
        </div>
      </div>

      <Dialog open={showAddNameModal} onOpenChange={setShowAddNameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a name</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={addNameInput}
            onChange={e => setAddNameInput(e.target.value)}
            placeholder="Name"
            className={INPUT_FIELD_CLASSES}
            onKeyDown={e => e.key === 'Enter' && handleSaveAddName()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNameModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAddName} disabled={!addNameInput.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold block mb-1">Logbook title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={INPUT_FIELD_CLASSES}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex-1">
            <label className="text-sm font-semibold block mb-1">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={INPUT_FIELD_CLASSES}
              required
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-semibold block mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={INPUT_FIELD_CLASSES}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Buddy Name</label>
          <input
            value={buddyName}
            onChange={e => setBuddyName(e.target.value)}
            placeholder="Optional travel buddy 🧸"
            className={INPUT_FIELD_CLASSES}
          />
        </div>

        <div>
          <label className="text-sm font-semibold block mb-2">Theme</label>
          <ThemePicker selected={theme} onSelect={setTheme} />
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={!startDate}
        className="mt-8 w-full bg-primary text-primary-foreground rounded-2xl py-4 font-bold text-lg disabled:opacity-50 shadow-lg active:scale-[0.98] transition-transform"
      >
        Open the logbook
      </button>
    </div>
  );
}
