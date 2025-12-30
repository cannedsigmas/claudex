import type { MarketplacePlugin } from '@/types/marketplace.types';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/primitives/Badge';

interface PluginCardProps {
  plugin: MarketplacePlugin;
  isInstalled: boolean;
  onClick: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  development: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  productivity: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  testing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  database: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  deployment: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  security: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  design: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export const PluginCard: React.FC<PluginCardProps> = ({ plugin, isInstalled, onClick }) => {
  const categoryColor = CATEGORY_COLORS[plugin.category] || CATEGORY_COLORS.other;

  return (
    <button
      onClick={onClick}
      className="border-border-primary bg-surface-primary dark:border-border-dark-primary dark:bg-surface-dark-primary group flex w-full flex-col rounded-lg border p-4 text-left transition-all hover:border-brand-500 hover:shadow-md dark:hover:border-brand-400"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-text-primary dark:text-text-dark-primary">
              {plugin.name}
            </h3>
            {isInstalled && (
              <Badge variant="success" size="sm">
                Installed
              </Badge>
            )}
          </div>
          {plugin.author?.name && (
            <p className="mt-0.5 text-xs text-text-tertiary dark:text-text-dark-tertiary">
              by {plugin.author.name}
            </p>
          )}
        </div>
        {plugin.version && (
          <span className="flex-shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-xs text-text-secondary dark:bg-surface-dark-secondary dark:text-text-dark-secondary">
            v{plugin.version}
          </span>
        )}
      </div>

      <p className="mb-3 line-clamp-2 flex-1 text-xs text-text-secondary dark:text-text-dark-secondary">
        {plugin.description}
      </p>

      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor}`}>
          {plugin.category}
        </span>
        <ChevronRight className="h-4 w-4 text-text-tertiary transition-colors group-hover:text-brand-500 dark:text-text-dark-tertiary dark:group-hover:text-brand-400" />
      </div>
    </button>
  );
};
