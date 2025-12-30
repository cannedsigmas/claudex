import { memo } from 'react';
import { Terminal } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

interface BashInput {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
}

const formatOutput = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const BashToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as BashInput | undefined;
  const command = input?.command ?? '';
  const description = input?.description;

  const output = formatOutput(tool.result);
  const hasExpandableContent =
    command.length > 50 || (output.length > 0 && tool.status === 'completed');

  return (
    <ToolCard
      icon={<Terminal className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={tool.status}
      title={(status) => {
        if (description) {
          return status === 'failed' ? `Failed: ${description}` : description;
        }
        if (!command) return status === 'completed' ? 'Ran command' : 'Run command';
        switch (status) {
          case 'completed':
            return `Ran: ${command}`;
          case 'failed':
            return `Failed: ${command}`;
          default:
            return `Running: ${command}`;
        }
      }}
      loadingContent="Running command..."
      error={tool.error}
      expandable={hasExpandableContent}
    >
      {hasExpandableContent && (
        <div className="space-y-3 border-t border-border/50 p-3 dark:border-border-dark/50">
          {command.length > 50 && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Command
              </div>
              <div className="rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                <pre className="whitespace-pre-wrap break-all">{command}</pre>
              </div>
            </div>
          )}
          {output.length > 0 && tool.status === 'completed' && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Output
              </div>
              <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                <pre className="whitespace-pre-wrap break-all">{output}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolCard>
  );
};

export const BashTool = memo(BashToolInner);
