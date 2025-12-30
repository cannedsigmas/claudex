import { apiClient } from '@/lib/api';
import { ensureResponse, withAuth } from '@/services/base';
import type {
  InstallComponentRequest,
  InstallResponse,
  InstalledPlugin,
  MarketplacePlugin,
  PluginDetails,
  UninstallComponentRequest,
  UninstallResponse,
} from '@/types/marketplace.types';

async function getCatalog(forceRefresh = false): Promise<MarketplacePlugin[]> {
  return withAuth(async () => {
    const params = forceRefresh ? '?force_refresh=true' : '';
    const response = await apiClient.get<MarketplacePlugin[]>(`/marketplace/catalog${params}`);
    return response ?? [];
  });
}

async function getPluginDetails(pluginName: string): Promise<PluginDetails> {
  return withAuth(async () => {
    const response = await apiClient.get<PluginDetails>(
      `/marketplace/catalog/${encodeURIComponent(pluginName)}`,
    );
    return ensureResponse(response, 'Plugin not found');
  });
}

async function installComponents(request: InstallComponentRequest): Promise<InstallResponse> {
  return withAuth(async () => {
    const response = await apiClient.post<InstallResponse>('/marketplace/install', request);
    return ensureResponse(response, 'Installation failed');
  });
}

async function getInstalledPlugins(): Promise<InstalledPlugin[]> {
  return withAuth(async () => {
    const response = await apiClient.get<InstalledPlugin[]>('/marketplace/installed');
    return response ?? [];
  });
}

async function uninstallComponents(request: UninstallComponentRequest): Promise<UninstallResponse> {
  return withAuth(async () => {
    const response = await apiClient.post<UninstallResponse>('/marketplace/uninstall', request);
    return ensureResponse(response, 'Uninstallation failed');
  });
}

export const marketplaceService = {
  getCatalog,
  getPluginDetails,
  installComponents,
  uninstallComponents,
  getInstalledPlugins,
};
