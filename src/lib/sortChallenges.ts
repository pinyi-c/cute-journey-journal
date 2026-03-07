import type { Challenge } from '@/lib/journeyContext';

export type SortOption = 'date-desc' | 'date-asc' | 'lastmod-desc' | 'lastmod-asc';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Date (new → old)' },
  { value: 'date-asc', label: 'Date (old → new)' },
  { value: 'lastmod-desc', label: 'Last modified (new → old)' },
  { value: 'lastmod-asc', label: 'Last modified (old → new)' },
];

const DEFAULT_SORT: SortOption = 'date-desc';

export function getDefaultSort(): SortOption {
  return DEFAULT_SORT;
}

function getLastModified(c: Challenge): number {
  if (c.lastModified != null) return c.lastModified;
  if (c.date) {
    const t = new Date(c.date).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/** Returns a new sorted array. Does not mutate. */
export function sortChallenges(challenges: Challenge[], sortBy: SortOption): Challenge[] {
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

  if (sortBy === 'lastmod-desc') {
    sorted.sort((a, b) => getLastModified(b) - getLastModified(a));
    return sorted;
  }

  if (sortBy === 'lastmod-asc') {
    sorted.sort((a, b) => getLastModified(a) - getLastModified(b));
    return sorted;
  }

  return sorted;
}
