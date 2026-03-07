import { useLocation, useNavigate } from 'react-router-dom';
import { NotebookPen, Images, BookOpen } from 'lucide-react';
import { useLang } from '@/lib/i18n';

const tabs = [
  { path: '/challenges', icon: NotebookPen, labelKey: 'tabs.logbook' as const },
  { path: '/gallery', icon: Images, labelKey: 'tabs.snapshots' as const },
  { path: '/summary', icon: BookOpen, labelKey: 'tabs.exportPdf' as const },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();

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
                active ? 'text-primary' : 'text-slate-600'
              }`}
            >
              <tab.icon size={20} />
              <span className="text-xs font-semibold">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
