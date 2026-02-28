/** Maximum number of photos allowed per challenge. */
export const MAX_PHOTOS_PER_CHALLENGE = 10;

/** Stable IndexedDB key for the dedicated PDF cover photo (one per app/journey). */
export const COVER_PHOTO_ID = 'coverPhoto';

/** Base Tailwind classes for single-line text/date inputs. */
export const INPUT_FIELD_CLASSES =
  'w-full mt-1 h-12 px-4 py-3 rounded-2xl bg-card border border-border text-base focus:outline-none focus:ring-2 focus:ring-ring';

/** Base Tailwind classes for multi-line textareas (e.g., captions). */
export const TEXTAREA_FIELD_CLASSES =
  'w-full mt-1 px-3 py-2.5 rounded-2xl bg-card border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring';
