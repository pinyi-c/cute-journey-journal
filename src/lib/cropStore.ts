type PendingCrop = {
  file: File;
  challengeId: string;
} | null;

let pending: PendingCrop = null;

export function setPendingCrop(data: { file: File; challengeId: string }) {
  pending = { ...data };
}

export function consumePendingCrop(): PendingCrop {
  const current = pending;
  pending = null;
  return current;
}

