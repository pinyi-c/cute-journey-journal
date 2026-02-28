import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useJourney, ThemeId } from '@/lib/journeyContext';
import { ThemePicker } from '@/components/ThemePicker';
import mascotUrl from '@/assets/mascot.svg';
import { INPUT_FIELD_CLASSES } from '@/lib/constants';
import { clearAllPhotos } from '@/lib/photoDb';
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

export default function Onboarding() {
  const { journey, createJourney, updateJourneyDetails, resetJourney } = useJourney();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(location.state && (location.state as { edit?: boolean }).edit && journey);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showNewJourneyConfirm, setShowNewJourneyConfirm] = useState(false);
  const [title, setTitle] = useState(
    journey ? journey.title : "Erina's Taipei Adventure Journal",
  );
  const [startDate, setStartDate] = useState(journey ? journey.startDate : '');
  const [endDate, setEndDate] = useState(journey ? journey.endDate : '');
  const [buddyName, setBuddyName] = useState(journey ? journey.buddyName : '');
  const [theme, setTheme] = useState<ThemeId>(journey ? journey.theme : 'pink');

  // If journey exists and user hasn't clicked "new", show continue screen
  if (journey && !showNewForm && !isEditing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto">
        <img src={mascotUrl} alt="Journey mascot" className="w-24 h-24 mb-4" />
        <h1 className="text-2xl font-extrabold mb-2 text-center">Welcome back! 🎉</h1>
        <p className="text-muted-foreground mb-6 text-center">
          Your journey: <strong className="text-foreground">{journey.title}</strong>
        </p>
        <button
          onClick={() => navigate('/challenges')}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-bold text-lg shadow-lg active:scale-[0.98] transition-transform"
        >
          Continue Journey ✨
        </button>
        <button
          onClick={() => setShowNewJourneyConfirm(true)}
          className="mt-4 text-sm text-muted-foreground underline"
        >
          Start a new journey
        </button>

        <AlertDialog open={showNewJourneyConfirm} onOpenChange={setShowNewJourneyConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start a new journey?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete your current journey and all saved photos. This cannot be undone.
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
      updateJourneyDetails({ title, startDate, endDate, buddyName, theme });
    } else {
      createJourney({ title, startDate, endDate, buddyName, theme });
    }
    navigate('/challenges');
  };

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-md mx-auto">
      <div className="flex flex-col items-center mb-8 pt-8">
        <img src={mascotUrl} alt="Journey mascot" className="w-28 h-28 mb-3 drop-shadow-lg" />
        <h1 className="text-2xl font-extrabold text-center">Welcome to Taiwan!</h1>
        <p className="text-muted-foreground text-sm mt-1">Tiny moments, big memories. 😋</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold block mb-1">Journey Title</label>
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
        Start My Journey! 🚀
      </button>
    </div>
  );
}
