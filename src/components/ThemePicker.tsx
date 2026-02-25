import { ThemeId } from '@/lib/journeyContext';

const themes: { id: ThemeId; color: string; label: string }[] = [
  { id: 'pink', color: '#D45D7E', label: 'Pink' },
  { id: 'mint', color: '#45A882', label: 'Mint' },
  { id: 'lavender', color: '#8B6DB5', label: 'Lavender' },
  { id: 'sky', color: '#4A9ED6', label: 'Sky' },
  { id: 'peach', color: '#D68A4A', label: 'Peach' },
];

interface Props {
  selected: ThemeId;
  onSelect: (id: ThemeId) => void;
}

export function ThemePicker({ selected, onSelect }: Props) {
  return (
    <div className="flex gap-3">
      {themes.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`w-12 h-12 rounded-full transition-all border-[3px] ${
            selected === t.id
              ? 'scale-110 border-foreground shadow-lg'
              : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: t.color }}
          title={t.label}
        />
      ))}
    </div>
  );
}
