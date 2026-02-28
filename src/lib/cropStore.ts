export type PendingCrop =
  | { file: File; challengeId: string }
  | { file: File; coverPhoto: true }
  | null;

let pending: PendingCrop = null;

export function setPendingCrop(
  data: { file: File; challengeId: string } | { file: File; coverPhoto: true },
) {
  pending = { ...data };
}

export function consumePendingCrop(): PendingCrop {
  const current = pending;
  pending = null;
  return current;
}

