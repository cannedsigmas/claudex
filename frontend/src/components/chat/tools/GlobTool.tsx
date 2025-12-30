import { memo } from 'react';
import { FolderSearch } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

interface GlobInput {
  pattern: string;
  path?: string;
}

const parseResult = (result: unknown): string[] => {
  if (Array.isArray(result)) return result.map(String);
  if (typeof result === 'string') return result.split('\n').filter(Boolean);
  return [];
};

const GlobToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as GlobInput | undefined;
  const pattern = input?.pattern ?? '*';
  const path = input?.path;

  const files = parseResult(tool.result);
  const hasFiles = files.length > 0 && tool.status === 'completed';
  const locationSuffix = path ? ` in ${path}` : '';

  return (
    <ToolCard
      icon={
        <FolderSearch className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />
      }
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Found: ${pattern}${locationSuffix}`;
          case 'failed':
            return `Failed to find: ${pattern}${locationSuffix}`;
          default:
            return `Finding: ${pattern}${locationSuffix}`;
        }
      }}
      loadingContent="Searching for files..."
      error={tool.error}
      expandable={hasFiles}
    >
      {hasFiles && (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <div className="space-y-0.5">
            <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
              Matched files ({files.length})
            </div>
            <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
              {files.map((file, idx) => (
                <div key={idx} className="truncate">
                  {file}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ToolCard>
  );
};

export const GlobTool = memo(GlobToolInner);
