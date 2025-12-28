import { MessagesSquare, Code, SquareTerminal, KeyRound, Globe, Smartphone } from 'lucide-react';
import { useUIStore } from '@/store';
import { cn } from '@/utils/cn';
import type { ViewType } from '@/types/ui.types';
import { LAYOUT_CLASSES } from '@/config/constants';
import { useIsMobile } from '@/hooks';
import { Tooltip } from './Tooltip';

function VSCodeIcon({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.15 2.587L18.21.21a1.49 1.49 0 0 0-1.705.29l-9.46 8.63l-4.12-3.128a1 1 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12L.326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a1 1 0 0 0 1.276.057l4.12-3.128l9.46 8.63a1.49 1.49 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352m-5.146 14.861L10.826 12l7.178-5.448z" />
    </svg>
  );
}

interface ActivityBarButton {
  view: ViewType;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hideOnMobile?: boolean;
}

const buttons: ActivityBarButton[] = [
  { view: 'agent', icon: MessagesSquare, label: 'Agent' },
  { view: 'ide', icon: VSCodeIcon, label: 'IDE', hideOnMobile: true },
  { view: 'editor', icon: Code, label: 'Editor' },
  { view: 'terminal', icon: SquareTerminal, label: 'Terminal' },
  { view: 'secrets', icon: KeyRound, label: 'Secrets' },
  { view: 'webPreview', icon: Globe, label: 'Web Preview' },
  { view: 'mobilePreview', icon: Smartphone, label: 'Mobile Preview' },
];

export function ActivityBar() {
  const currentView = useUIStore((state) => state.currentView);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const isMobile = useIsMobile();

  const visibleButtons = buttons.filter((btn) => !isMobile || !btn.hideOnMobile);

  return (
    <div
      className={cn(
        'absolute left-0 top-0 z-50 flex h-full flex-col bg-surface dark:bg-surface-dark',
        LAYOUT_CLASSES.ACTIVITY_BAR_WIDTH,
      )}
    >
      {visibleButtons.map(({ view, icon: Icon, label }) => (
        <Tooltip key={view} content={label} position="right">
          <button
            onClick={() => setCurrentView(view)}
            className={cn(
              'flex h-12 w-full items-center justify-center border-l-2 transition-all duration-200',
              currentView === view
                ? 'border-brand-600 bg-surface text-brand-600 dark:border-brand-400 dark:bg-surface-dark dark:text-brand-400'
                : 'border-transparent text-text-tertiary hover:bg-surface-hover hover:text-text-primary dark:text-text-dark-tertiary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary',
            )}
            aria-label={`Switch to ${label.toLowerCase()} view`}
            aria-pressed={currentView === view}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export { ActivityBar as ViewSwitcher };
