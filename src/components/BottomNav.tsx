import { useLocation, useNavigate } from 'react-router-dom';
import { ListChecks, Images, Trophy } from 'lucide-react';

const tabs = [
  { path: '/challenges', icon: ListChecks, label: 'Journal' },
  { path: '/gallery', icon: Images, label: 'Memories' },
  { path: '/summary', icon: Trophy, label: 'Booklet' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-md border-t border-border z-50">
      <div className="max-w-md mx-auto flex">
        {tabs.map(tab => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <tab.icon size={20} />
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
