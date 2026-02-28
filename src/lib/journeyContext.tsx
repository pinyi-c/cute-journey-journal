import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type ThemeId = 'pink' | 'mint' | 'lavender' | 'sky' | 'peach';

export interface Challenge {
  id: string;
  title: string;
  completed: boolean;
  caption: string;
  date: string;
  location: string;
  photoIds: string[];
}

export interface Journey {
  title: string;
  startDate: string;
  endDate: string;
  buddyName: string;
  theme: ThemeId;
  challenges: Challenge[];
  /** Optional cover photo ID for PDF booklet (from completed challenges' photos). */
  coverPhotoId?: string | null;
}

interface JourneyContextType {
  journey: Journey | null;
  createJourney: (data: Omit<Journey, 'challenges'>) => void;
  updateJourneyDetails: (data: Partial<Omit<Journey, 'challenges'>>) => void;
  updateChallenge: (id: string, updates: Partial<Challenge>) => void;
  addChallenge: (title: string) => void;
  deleteChallenge: (id: string) => void;
   saveNow: () => void;
  resetJourney: () => void;
}

const STORAGE_KEY = 'cute-journey-data';

const JourneyContext = createContext<JourneyContextType | null>(null);

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used within JourneyProvider');
  return ctx;
}

const DEFAULT_CHALLENGES = [
  'Night Market Snacks 🍢',
  'Bubble Tea 🧋',
  'Iconic Street Scene 🛵',
  'Temple or Cultural Spot 🏮',
  'Cute Café ☕',
  'Public Transport Ride 🚇',
  'A Funny Discovery 😄',
  'A Photo Together 🤳',
  'Local Breakfast 🍳',
  'City Walk! 🌆',
];

function makeChallenge(title: string): Challenge {
  return {
    id: crypto.randomUUID(),
    title,
    completed: false,
    caption: '',
    date: '',
    location: '',
    photoIds: [],
  };
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [journey, setJourney] = useState<Journey | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (journey) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(journey));
      document.documentElement.setAttribute('data-theme', journey.theme);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute('data-theme');
    }
  }, [journey]);

  const createJourney = useCallback((data: Omit<Journey, 'challenges' | 'coverPhotoId'>) => {
    setJourney({
      ...data,
      challenges: DEFAULT_CHALLENGES.map(makeChallenge),
      coverPhotoId: null,
    });
  }, []);

  const updateJourneyDetails = useCallback((data: Partial<Omit<Journey, 'challenges'>>) => {
    setJourney(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ...data,
        challenges: prev.challenges,
      };
    });
  }, []);

  const updateChallenge = useCallback((id: string, updates: Partial<Challenge>) => {
    setJourney(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        challenges: prev.challenges.map(c => c.id === id ? { ...c, ...updates } : c),
      };
    });
  }, []);

  const addChallenge = useCallback((title: string) => {
    setJourney(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        challenges: [...prev.challenges, makeChallenge(title)],
      };
    });
  }, []);

  const deleteChallenge = useCallback((id: string) => {
    setJourney(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        challenges: prev.challenges.filter(c => c.id !== id),
      };
    });
  }, []);

  const resetJourney = useCallback(() => {
    setJourney(null);
  }, []);

  const saveNow = useCallback(() => {
    if (journey) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(journey));
      document.documentElement.setAttribute('data-theme', journey.theme);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute('data-theme');
    }
  }, [journey]);

  return (
    <JourneyContext.Provider
      value={{
        journey,
        createJourney,
        updateJourneyDetails,
        updateChallenge,
        addChallenge,
        deleteChallenge,
        saveNow,
        resetJourney,
      }}
    >
      {children}
    </JourneyContext.Provider>
  );
}
