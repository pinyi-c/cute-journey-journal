import { ThemeId } from '@/lib/journeyContext';

export const THEMES: { id: ThemeId; name: string; colors: { primary: string; secondary: string; accent: string } }[] = [
  { id: 'oat-latte', name: 'Oat Latte', colors: { primary: '#D8CBB8', secondary: '#F6F1E8', accent: '#A67C52' } },
  { id: 'sage-mist', name: 'Sage Mist', colors: { primary: '#B7C2B0', secondary: '#EFF3EE', accent: '#6F8A6B' } },
  { id: 'clay-blush', name: 'Clay Blush', colors: { primary: '#D9B6A3', secondary: '#F7EEE9', accent: '#B46A55' } },
  { id: 'sand-sea', name: 'Sand Sea', colors: { primary: '#B7C7C9', secondary: '#EEF3F4', accent: '#5D7E86' } },
  { id: 'mocha-stone', name: 'Mocha Stone', colors: { primary: '#C7C0B7', secondary: '#F2F0EC', accent: '#6B625A' } },
];

interface Props {
  selected: ThemeId;
  onSelect: (id: ThemeId) => void;
}

export function ThemePicker({ selected, onSelect }: Props) {
  return (
    <div className="flex gap-3">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`w-12 h-12 rounded-full transition-all border-[3px] ${
            selected === t.id
              ? 'scale-110 border-foreground shadow-lg ring-2 ring-ring ring-offset-2 ring-offset-background'
              : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: t.colors.primary }}
          title={t.name}
        />
      ))}
    </div>
  );
}
