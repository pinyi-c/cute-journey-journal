import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Avatar display: "erina" (case-insensitive) uses mascot; else letter avatar. */
export function getAvatarType(name: string): 'mascot' | 'letter' {
  const t = name.trim().toLowerCase();
  return t === 'erina' ? 'mascot' : 'letter';
}

/** Letter for letter avatar: first character uppercased, or "?" if empty. */
export function getAvatarLetter(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return t[0].toUpperCase();
}
