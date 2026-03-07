import type { Challenge } from '@/lib/journeyContext';

export type SortOption = 'manual' | 'date-desc' | 'date-asc';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'manual', label: 'Same as Journal (custom order)' },
  { value: 'date-desc', label: 'Date (new → old)' },
  { value: 'date-asc', label: 'Date (old → new)' },
];

const DEFAULT_SORT: SortOption = 'date-desc';

export function getDefaultSort(): SortOption {
  return DEFAULT_SORT;
}

/** Returns a new sorted array for date modes; returns same array for manual. Does not mutate stored order. */
export function sortChallenges(challenges: Challenge[], sortBy: SortOption): Challenge[] {
  if (sortBy === 'manual') return challenges;

  const sorted = [...challenges];

  if (sortBy === 'date-desc') {
    sorted.sort((a, b) => {
      const ad = a.date || '';
      const bd = b.date || '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return bd.localeCompare(ad);
    });
    return sorted;
  }

  if (sortBy === 'date-asc') {
    sorted.sort((a, b) => {
      const ad = a.date || '';
      const bd = b.date || '';
      if (!ad && !bd) return 0;
      if (!ad) return -1;
      if (!bd) return 1;
      return ad.localeCompare(bd);
    });
    return sorted;
  }

  return sorted;
}
