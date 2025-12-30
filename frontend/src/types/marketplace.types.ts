export interface MarketplaceAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface MarketplacePlugin {
  name: string;
  description: string;
  category: string;
  source: string;
  version?: string;
  author?: MarketplaceAuthor;
  homepage?: string;
}

export interface PluginComponents {
  agents: string[];
  commands: string[];
  skills: string[];
  mcp_servers: string[];
}

export interface PluginDetails extends MarketplacePlugin {
  readme?: string;
  components: PluginComponents;
}

export interface InstalledPlugin {
  name: string;
  version?: string;
  installed_at: string;
  components: string[];
}

export interface InstallComponentRequest {
  plugin_name: string;
  components: string[];
}

export interface InstallComponentResult {
  component: string;
  success: boolean;
  error?: string;
}

export interface InstallResponse {
  plugin_name: string;
  version?: string;
  installed: string[];
  failed: InstallComponentResult[];
}

export interface UninstallComponentRequest {
  plugin_name: string;
  components: string[];
}

export interface UninstallResponse {
  plugin_name: string;
  uninstalled: string[];
  failed: InstallComponentResult[];
}
