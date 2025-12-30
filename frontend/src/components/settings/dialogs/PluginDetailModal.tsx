import { useState, useEffect } from 'react';
import { BaseModal } from '@/components/ui/shared/BaseModal';
import { Button } from '@/components/ui/primitives/Button';
import { Spinner } from '@/components/ui/primitives/Spinner';
import MarkDown from '@/components/ui/MarkDown';
import { Bot, Terminal, Zap, Plug, ExternalLink, X, AlertCircle } from 'lucide-react';
import {
  usePluginDetailsQuery,
  useInstallComponentsMutation,
  useUninstallComponentsMutation,
  useInstalledPluginsQuery,
} from '@/hooks/queries/useMarketplaceQueries';
import type { MarketplacePlugin } from '@/types/marketplace.types';
import toast from 'react-hot-toast';

interface PluginDetailModalProps {
  plugin: MarketplacePlugin | null;
  isOpen: boolean;
  onClose: () => void;
}

const COMPONENT_ICONS = {
  agent: Bot,
  command: Terminal,
  skill: Zap,
  mcp: Plug,
} as const;

export const PluginDetailModal: React.FC<PluginDetailModalProps> = ({
  plugin,
  isOpen,
  onClose,
}) => {
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [selectedForUninstall, setSelectedForUninstall] = useState<Set<string>>(new Set());

  const {
    data: details,
    isLoading,
    isError,
    error,
  } = usePluginDetailsQuery(isOpen ? (plugin?.name ?? null) : null);
  const { data: installedPlugins = [] } = useInstalledPluginsQuery();
  const installMutation = useInstallComponentsMutation();
  const uninstallMutation = useUninstallComponentsMutation();

  const installedPlugin = installedPlugins.find((p) => p.name === plugin?.name);
  const installedComponents = new Set(installedPlugin?.components ?? []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedComponents(new Set());
      setSelectedForUninstall(new Set());
    }
  }, [isOpen]);

  if (!plugin) return null;

  const allComponents = details
    ? [
        ...details.components.agents.map((name) => ({
          type: 'agent' as const,
          name,
        })),
        ...details.components.commands.map((name) => ({
          type: 'command' as const,
          name,
        })),
        ...details.components.skills.map((name) => ({
          type: 'skill' as const,
          name,
        })),
        ...details.components.mcp_servers.map((name) => ({
          type: 'mcp' as const,
          name,
        })),
      ]
    : [];

  const toggleComponent = (componentId: string) => {
    const newSelected = new Set(selectedComponents);
    if (newSelected.has(componentId)) {
      newSelected.delete(componentId);
    } else {
      newSelected.add(componentId);
    }
    setSelectedComponents(newSelected);
  };

  const toggleUninstall = (componentId: string) => {
    const newSelected = new Set(selectedForUninstall);
    if (newSelected.has(componentId)) {
      newSelected.delete(componentId);
    } else {
      newSelected.add(componentId);
    }
    setSelectedForUninstall(newSelected);
  };

  const selectAll = () => {
    const notInstalled = allComponents
      .map((c) => `${c.type}:${c.name}`)
      .filter((id) => !installedComponents.has(id));
    setSelectedComponents(new Set(notInstalled));
  };

  const selectAllForUninstall = () => {
    const installed = allComponents
      .map((c) => `${c.type}:${c.name}`)
      .filter((id) => installedComponents.has(id));
    setSelectedForUninstall(new Set(installed));
  };

  const hasUninstalledComponents = allComponents.some(
    (c) => !installedComponents.has(`${c.type}:${c.name}`),
  );
  const hasInstalledComponents = allComponents.some((c) =>
    installedComponents.has(`${c.type}:${c.name}`),
  );

  const handleInstall = async () => {
    if (selectedComponents.size === 0) {
      toast.error('Select at least one component to install');
      return;
    }

    try {
      const result = await installMutation.mutateAsync({
        plugin_name: plugin.name,
        components: Array.from(selectedComponents),
      });

      if (result.installed.length > 0) {
        toast.success(`Installed ${result.installed.length} component(s)`);
      }
      if (result.failed.length > 0) {
        const errorMessages = result.failed
          .map((f) => f.error || 'Unknown error')
          .filter((e) => e)
          .join(', ');
        toast.error(`Failed: ${errorMessages || 'Installation failed'}`);
      }
      if (result.installed.length > 0) {
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Installation failed');
    }
  };

  const handleUninstall = async () => {
    if (selectedForUninstall.size === 0) {
      toast.error('Select at least one component to uninstall');
      return;
    }

    try {
      const result = await uninstallMutation.mutateAsync({
        plugin_name: plugin.name,
        components: Array.from(selectedForUninstall),
      });

      if (result.uninstalled.length > 0) {
        toast.success(`Uninstalled ${result.uninstalled.length} component(s)`);
        setSelectedForUninstall(new Set());
      }
      if (result.failed.length > 0) {
        const errorMessages = result.failed
          .map((f) => f.error || 'Unknown error')
          .filter((e) => e)
          .join(', ');
        toast.error(`Failed: ${errorMessages || 'Uninstallation failed'}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Uninstallation failed');
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex max-h-[80vh] flex-col">
        <div className="border-border-primary bg-surface-primary dark:border-border-dark-primary dark:bg-surface-dark-primary flex items-center justify-between border-b p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-text-primary dark:text-text-dark-primary">
                {plugin.name}
              </h2>
              {plugin.version && (
                <span className="rounded bg-surface-secondary px-2 py-0.5 text-xs dark:bg-surface-dark-secondary">
                  v{plugin.version}
                </span>
              )}
            </div>
            {plugin.author?.name && (
              <p className="mt-0.5 text-sm text-text-secondary dark:text-text-dark-secondary">
                by {plugin.author.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {plugin.homepage && (
              <a
                href={plugin.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-text-tertiary hover:bg-surface-secondary hover:text-text-primary dark:text-text-dark-tertiary dark:hover:bg-surface-dark-secondary dark:hover:text-text-dark-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded p-1.5 text-text-tertiary hover:bg-surface-secondary hover:text-text-primary dark:text-text-dark-tertiary dark:hover:bg-surface-dark-secondary dark:hover:text-text-dark-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
            {plugin.description}
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-error-200 bg-error-50 p-6 text-center dark:border-error-800 dark:bg-error-900/20">
              <AlertCircle className="mx-auto mb-3 h-6 w-6 text-error-500 dark:text-error-400" />
              <p className="mb-1 text-sm font-medium text-error-700 dark:text-error-300">
                Failed to load plugin details
              </p>
              <p className="text-xs text-error-600 dark:text-error-400">
                {error instanceof Error ? error.message : 'An error occurred'}
              </p>
            </div>
          ) : details && allComponents.length > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
                  Components
                </h3>
                <div className="flex gap-3">
                  {hasInstalledComponents && (
                    <button
                      onClick={selectAllForUninstall}
                      className="text-xs text-error-600 hover:text-error-700 dark:text-error-400 dark:hover:text-error-300"
                    >
                      Select all installed
                    </button>
                  )}
                  {hasUninstalledComponents && (
                    <button
                      onClick={selectAll}
                      className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                    >
                      Select all available
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 space-y-2">
                {allComponents.map((comp) => {
                  const componentId = `${comp.type}:${comp.name}`;
                  const Icon = COMPONENT_ICONS[comp.type];
                  const isInstalled = installedComponents.has(componentId);
                  const isSelected = selectedComponents.has(componentId);
                  const isSelectedForUninstall = selectedForUninstall.has(componentId);

                  return (
                    <label
                      key={componentId}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                        isSelectedForUninstall
                          ? 'border-error-500 bg-error-50 dark:border-error-400 dark:bg-error-900/20'
                          : isInstalled
                            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                            : isSelected
                              ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20'
                              : 'border-border-primary dark:border-border-dark-primary hover:border-brand-300 dark:hover:border-brand-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-4 w-4 ${
                            isSelectedForUninstall
                              ? 'text-error-600 dark:text-error-400'
                              : isInstalled
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-text-tertiary dark:text-text-dark-tertiary'
                          }`}
                        />
                        <div>
                          <span className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
                            {comp.name}
                          </span>
                          <span className="ml-2 text-xs capitalize text-text-tertiary dark:text-text-dark-tertiary">
                            {comp.type}
                          </span>
                        </div>
                      </div>
                      {isInstalled ? (
                        <input
                          type="checkbox"
                          checked={isSelectedForUninstall}
                          onChange={() => toggleUninstall(componentId)}
                          className="h-4 w-4 rounded border-gray-300 text-error-600 focus:ring-error-500"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleComponent(componentId)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              {details.readme && (
                <div className="mb-4">
                  <h3 className="mb-2 text-sm font-medium text-text-primary dark:text-text-dark-primary">
                    Documentation
                  </h3>
                  <div className="max-h-64 overflow-y-auto rounded-lg bg-surface-secondary p-3 dark:bg-surface-dark-secondary">
                    <MarkDown content={details.readme} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-text-tertiary dark:text-text-dark-tertiary">
              No components available
            </p>
          )}
        </div>

        <div className="border-border-primary bg-surface-primary dark:border-border-dark-primary dark:bg-surface-dark-primary flex justify-end gap-2 border-t p-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {selectedForUninstall.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleUninstall}
              disabled={uninstallMutation.isPending}
              isLoading={uninstallMutation.isPending}
            >
              Uninstall ({selectedForUninstall.size})
            </Button>
          )}
          {selectedComponents.size > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleInstall}
              disabled={installMutation.isPending || isError}
              isLoading={installMutation.isPending}
            >
              Install ({selectedComponents.size})
            </Button>
          )}
        </div>
      </div>
    </BaseModal>
  );
};
