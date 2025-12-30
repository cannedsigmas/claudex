import { apiClient } from '@/lib/api';
import { ensureResponse, withAuth } from '@/services/base';
import { validateRequired } from '@/utils/validation';
import type { CustomMcp } from '@/types';

interface McpCreateRequest {
  name: string;
  description: string;
  command_type: 'npx' | 'bunx' | 'uvx' | 'http';
  package?: string;
  url?: string;
  env_vars?: Record<string, string>;
  args?: string[];
  enabled?: boolean;
}

interface McpUpdateRequest {
  description?: string;
  command_type?: 'npx' | 'bunx' | 'uvx' | 'http';
  package?: string;
  url?: string;
  env_vars?: Record<string, string>;
  args?: string[];
  enabled?: boolean;
}

async function createMcp(data: McpCreateRequest): Promise<CustomMcp> {
  validateRequired(data.name, 'MCP name');
  validateRequired(data.description, 'MCP description');

  return withAuth(async () => {
    const response = await apiClient.post<CustomMcp>('/mcps/', data);
    return ensureResponse(response, 'Failed to create MCP');
  });
}

async function updateMcp(mcpName: string, data: McpUpdateRequest): Promise<CustomMcp> {
  validateRequired(mcpName, 'MCP name');

  return withAuth(async () => {
    const response = await apiClient.put<CustomMcp>(`/mcps/${mcpName}`, data);
    return ensureResponse(response, 'Failed to update MCP');
  });
}

async function deleteMcp(mcpName: string): Promise<void> {
  validateRequired(mcpName, 'MCP name');

  await withAuth(async () => {
    await apiClient.delete(`/mcps/${mcpName}`);
  });
}

export const mcpService = {
  createMcp,
  updateMcp,
  deleteMcp,
};
