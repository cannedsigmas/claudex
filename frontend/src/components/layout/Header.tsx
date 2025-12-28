import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useUIStore } from '@/store';
import { useCurrentUserQuery, useLogoutMutation, useUserUsageQuery } from '@/hooks/queries';
import { Button, ToggleButton } from '@/components/ui';
import { cn } from '@/utils/cn';
import { UserAvatarCircle } from '@/components/chat/message-bubble/MessageAvatars';
import type { UserUsage } from '@/types';
import logoDark from '/assets/images/logo-dark.svg';
import logoWhite from '/assets/images/logo-white.svg';

export interface HeaderProps {
  onLogout?: () => void;
  userName?: string;
  isAuthPage?: boolean;
}

const dropdownButtonClasses = cn(
  'w-full px-2.5 py-1.5 text-left text-xs',
  'text-text-primary dark:text-text-dark-secondary',
  'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
  'rounded-xl transition-all duration-200',
  'flex items-center gap-2 group',
);

function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: () => void,
) {
  useEffect(() => {
    function handle(event: MouseEvent) {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    }

    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [handler, ref]);
}

function buildUsageMeta(usage?: UserUsage) {
  if (!usage) return null;

  const isWarning = usage.daily_message_limit !== null && usage.messages_remaining === 1;
  const isAtLimit = usage.daily_message_limit !== null && usage.messages_remaining === 0;

  const emphasisClass = cn(
    'text-text-secondary dark:text-text-dark-secondary font-medium',
    isWarning && 'text-warning-600 dark:text-warning-400',
    isAtLimit && 'text-error-600 dark:text-error-400',
  );

  const barClass = cn(
    'h-full transition-all duration-300 ease-out',
    !isWarning && !isAtLimit && 'bg-success-500 dark:bg-success-400',
    isWarning && 'bg-warning-500 dark:bg-warning-400',
    isAtLimit && 'bg-error-500 dark:bg-error-400',
  );

  const width =
    usage.daily_message_limit === null
      ? '0%'
      : usage.daily_message_limit > 0
        ? `${Math.min(
            Math.max((usage.messages_used_today / usage.daily_message_limit) * 100, 2),
            100,
          )}%`
        : '0%';

  const icon =
    isWarning || isAtLimit ? (
      <AlertTriangle className="h-3 w-3 text-warning-500 dark:text-warning-400" />
    ) : null;

  return { emphasisClass, barClass, width, icon };
}

function HeaderLogo({ theme, onClick }: { theme: string; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      variant="unstyled"
      className="group flex items-center gap-3 transition-all duration-200 active:scale-95"
      aria-label="Go to home"
    >
      <img
        src={theme === 'dark' ? logoWhite : logoDark}
        alt="claudex Logo"
        className="h-14 w-14 object-contain transition-transform duration-200 group-hover:scale-110"
      />
    </Button>
  );
}

function SocialLinkButton() {
  return (
    <a
      href="https://x.com/Mng64218162"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'relative rounded-full p-1.5',
        'text-text-secondary hover:text-text-primary',
        'dark:text-text-quaternary dark:hover:text-text-dark-primary',
        'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
        'group transition-all duration-200 active:scale-95',
      )}
      aria-label="Follow on X"
      title="Follow on X"
    >
      <svg
        className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  );
}

function ThemeToggleButton({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <Button
      onClick={onToggle}
      variant="unstyled"
      className={cn(
        'relative rounded-full p-1.5',
        'text-text-secondary hover:text-text-primary',
        'dark:text-text-quaternary dark:hover:text-text-dark-primary',
        'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
        'group transition-all duration-200 active:scale-95',
      )}
      aria-label="Toggle theme"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </Button>
  );
}

function AuthButtons({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={onLogin}
        variant="unstyled"
        className={cn(
          'rounded-lg px-3 py-1.5 text-sm font-medium',
          'text-text-secondary hover:text-text-primary',
          'dark:text-text-dark-secondary dark:hover:text-text-dark-primary',
          'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
          'transition-all duration-200',
        )}
      >
        Log in
      </Button>
      <Button
        onClick={onSignup}
        variant="unstyled"
        className={cn(
          'rounded-lg px-3 py-1.5 text-sm font-medium',
          'bg-brand-500 text-white hover:bg-brand-600',
          'transition-colors duration-200',
        )}
      >
        Get Started
      </Button>
    </div>
  );
}

function UserMenu({
  displayName,
  usage,
  onSettings,
  onLogout,
}: {
  displayName: string;
  usage?: UserUsage;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setIsOpen(false), []);
  const toggleMenu = useCallback(() => setIsOpen((prev) => !prev), []);

  useClickOutside(dropdownRef, closeMenu);

  const usageMeta = useMemo(() => buildUsageMeta(usage), [usage]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={toggleMenu}
        variant="unstyled"
        className={cn(
          'flex items-center gap-1.5 rounded-full p-1',
          'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
          'group transition-all duration-200 active:scale-95',
        )}
        aria-label="User menu"
        title="Open user menu"
      >
        <UserAvatarCircle displayName={displayName} />
        <ChevronDown
          className={cn(
            'h-3 w-3 text-text-secondary transition-transform duration-200 dark:text-text-quaternary',
            isOpen && 'rotate-180',
          )}
        />
      </Button>

      {isOpen && (
        <div
          className={cn(
            'absolute right-0 mt-1.5 w-56',
            'bg-surface dark:bg-surface-dark',
            'border border-border dark:border-border-dark',
            'overflow-hidden rounded-2xl shadow-strong',
            'animate-in fade-in slide-in-from-top-1 duration-200',
          )}
        >
          <div className="p-1">
            <div className="border-b border-border px-3 py-2 dark:border-border-dark">
              <div className="mb-2 flex items-center gap-2">
                <UserAvatarCircle displayName={displayName} size="large" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary dark:text-text-dark-primary">
                    {displayName}
                  </p>
                </div>
              </div>
              {usageMeta && usage && usage.daily_message_limit !== null && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {usageMeta.icon}
                      <span className={usageMeta.emphasisClass}>Daily Messages:</span>
                    </div>
                    <span className={cn(usageMeta.emphasisClass, 'tabular-nums')}>
                      {usage.messages_used_today}/{usage.daily_message_limit}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full border border-border bg-surface-secondary dark:border-border-dark dark:bg-surface-dark-secondary">
                    <div className={usageMeta.barClass} style={{ width: usageMeta.width }} />
                  </div>
                </div>
              )}
            </div>

            <div className="p-1">
              <Button
                onClick={() => {
                  onSettings();
                  closeMenu();
                }}
                variant="unstyled"
                className={dropdownButtonClasses}
              >
                <Settings className="h-3.5 w-3.5 text-text-quaternary transition-colors group-hover:text-brand-500 dark:group-hover:text-brand-400" />
                <span className="transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  Settings
                </span>
              </Button>
              <Button
                onClick={() => {
                  onLogout();
                  closeMenu();
                }}
                variant="unstyled"
                className={dropdownButtonClasses}
              >
                <LogOut className="h-3.5 w-3.5 text-text-quaternary transition-all duration-200 group-hover:rotate-12 group-hover:text-error-500 dark:group-hover:text-error-400" />
                <span className="transition-colors group-hover:text-error-600 dark:group-hover:text-error-400">
                  Sign out
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ onLogout, userName = 'User', isAuthPage = false }: HeaderProps) {
  const navigate = useNavigate();
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  const { data: user } = useCurrentUserQuery({
    enabled: isAuthenticated && !isAuthPage,
  });

  const { data: usage } = useUserUsageQuery({
    enabled: isAuthenticated && !isAuthPage,
  });

  const logoutMutation = useLogoutMutation({
    onSuccess: () => {
      setAuthenticated(false);
      navigate('/login');
    },
  });

  const handleLogout = useCallback(() => {
    logoutMutation.mutate();
    onLogout?.();
  }, [logoutMutation, onLogout]);

  const displayName = user?.username || user?.email || userName;

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  return (
    <header className="z-50 bg-surface px-4 dark:bg-surface-dark">
      <div className="relative flex h-12 items-center justify-between">
        <div className="flex items-center gap-1">
          {isAuthenticated && !isAuthPage && (
            <ToggleButton
              isOpen={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              position="left"
              className="mr-1"
            />
          )}
          <HeaderLogo theme={theme} onClick={() => handleNavigate('/')} />
        </div>

        <div className="flex items-center gap-2">
          <SocialLinkButton />
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          {isAuthPage ? null : isAuthenticated ? (
            <UserMenu
              displayName={displayName}
              usage={usage}
              onSettings={() => handleNavigate('/settings')}
              onLogout={handleLogout}
            />
          ) : (
            <AuthButtons
              onLogin={() => handleNavigate('/login')}
              onSignup={() => handleNavigate('/signup')}
            />
          )}
        </div>
      </div>
    </header>
  );
}
