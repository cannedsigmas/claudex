import { memo } from 'react';
import { SquareTerminal } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

interface TaskOutputInput {
  task_id?: string;
  bash_id?: string;
  block?: boolean;
  timeout?: number;
}

const formatOutput = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const TaskOutputToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as TaskOutputInput | undefined;
  const taskId = input?.task_id ?? '';
  const truncatedId = taskId.length > 12 ? `${taskId.slice(0, 12)}...` : taskId;
  const idSuffix = taskId ? `: ${truncatedId}` : '';

  const output = formatOutput(tool.result);
  const hasOutput = output.length > 0 && tool.status === 'completed';

  return (
    <ToolCard
      icon={
        <SquareTerminal className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />
      }
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Got task output${idSuffix}`;
          case 'failed':
            return `Failed to get task output${idSuffix}`;
          default:
            return `Getting task output${idSuffix}`;
        }
      }}
      loadingContent="Waiting for task output..."
      error={tool.error}
      expandable={hasOutput}
    >
      {hasOutput && (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
            <pre className="whitespace-pre-wrap break-all">{output}</pre>
          </div>
        </div>
      )}
    </ToolCard>
  );
};

const BashOutputToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as TaskOutputInput | undefined;
  const bashId = input?.bash_id ?? '';
  const truncatedId = bashId.length > 12 ? `${bashId.slice(0, 12)}...` : bashId;
  const idSuffix = bashId ? `: ${truncatedId}` : '';

  const output = formatOutput(tool.result);
  const hasOutput = output.length > 0 && tool.status === 'completed';

  return (
    <ToolCard
      icon={
        <SquareTerminal className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />
      }
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Got bash output${idSuffix}`;
          case 'failed':
            return `Failed to get bash output${idSuffix}`;
          default:
            return `Getting bash output${idSuffix}`;
        }
      }}
      loadingContent="Waiting for bash output..."
      error={tool.error}
      expandable={hasOutput}
    >
      {hasOutput && (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
            <pre className="whitespace-pre-wrap break-all">{output}</pre>
          </div>
        </div>
      )}
    </ToolCard>
  );
};

export const TaskOutputTool = memo(TaskOutputToolInner);
export const BashOutputTool = memo(BashOutputToolInner);
