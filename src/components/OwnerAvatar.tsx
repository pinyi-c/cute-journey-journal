import { getAvatarType, getAvatarLetter, cn } from '@/lib/utils';
import mascotUrl from '@/assets/mascot.svg';

interface OwnerAvatarProps {
  name: string;
  className?: string;
  /** Accessible label (e.g. "Erina" or "Owner avatar") */
  alt?: string;
}

export function OwnerAvatar({ name, className, alt }: OwnerAvatarProps) {
  const type = getAvatarType(name);
  const letter = getAvatarLetter(name);

  if (type === 'mascot') {
    return (
      <img
        src={mascotUrl}
        alt={alt ?? 'Erina'}
        className={cn('rounded-full object-cover', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-muted border border-border flex items-center justify-center font-semibold text-foreground',
        className
      )}
      aria-hidden
    >
      {letter}
    </div>
  );
}
