import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marketplaceService } from '@/services/marketplaceService';
import type {
  InstallComponentRequest,
  InstallResponse,
  InstalledPlugin,
  MarketplacePlugin,
  PluginDetails,
  UninstallComponentRequest,
  UninstallResponse,
} from '@/types/marketplace.types';
import { queryKeys } from './queryKeys';

export const useMarketplaceCatalogQuery = (forceRefresh = false) => {
  return useQuery<MarketplacePlugin[]>({
    queryKey: queryKeys.marketplace.catalog,
    queryFn: () => marketplaceService.getCatalog(forceRefresh),
    staleTime: 5 * 60 * 1000,
  });
};

export const usePluginDetailsQuery = (pluginName: string | null) => {
  return useQuery<PluginDetails>({
    queryKey: queryKeys.marketplace.pluginDetails(pluginName ?? ''),
    queryFn: () => marketplaceService.getPluginDetails(pluginName!),
    enabled: !!pluginName,
  });
};

export const useInstalledPluginsQuery = () => {
  return useQuery<InstalledPlugin[]>({
    queryKey: queryKeys.marketplace.installed,
    queryFn: () => marketplaceService.getInstalledPlugins(),
  });
};

export const useInstallComponentsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<InstallResponse, Error, InstallComponentRequest>({
    mutationFn: (request) => marketplaceService.installComponents(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
      queryClient.invalidateQueries({ queryKey: [queryKeys.settings] });
    },
  });
};

export const useUninstallComponentsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<UninstallResponse, Error, UninstallComponentRequest>({
    mutationFn: (request) => marketplaceService.uninstallComponents(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
      queryClient.invalidateQueries({ queryKey: [queryKeys.settings] });
    },
  });
};

export const useRefreshCatalogMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<MarketplacePlugin[], Error>({
    mutationFn: () => marketplaceService.getCatalog(true),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.marketplace.catalog, data);
    },
  });
};
