import { memo } from 'react';
import { FileSearch } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

type OutputMode = 'content' | 'files_with_matches' | 'count';

interface GrepInput {
  pattern: string;
  path?: string;
  output_mode?: OutputMode;
  glob?: string;
  type?: string;
}

const formatResult = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const MODE_LABELS: Record<OutputMode, string> = {
  content: 'lines',
  files_with_matches: 'files',
  count: 'counts',
};

const GrepToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as GrepInput | undefined;
  const pattern = input?.pattern ?? '';
  const outputMode = input?.output_mode ?? 'files_with_matches';

  const result = formatResult(tool.result);
  const hasResult = result.length > 0 && tool.status === 'completed';
  const modeLabel = MODE_LABELS[outputMode];

  return (
    <ToolCard
      icon={<FileSearch className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Searched: "${pattern}" (${modeLabel})`;
          case 'failed':
            return `Failed to search: "${pattern}" (${modeLabel})`;
          default:
            return `Searching: "${pattern}" (${modeLabel})`;
        }
      }}
      loadingContent="Searching..."
      error={tool.error}
      expandable={hasResult}
    >
      {hasResult && (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <div className="space-y-0.5">
            <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
              Results
            </div>
            <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
              <pre className="whitespace-pre-wrap break-all">{result}</pre>
            </div>
          </div>
        </div>
      )}
    </ToolCard>
  );
};

export const GrepTool = memo(GrepToolInner);
