import { memo } from 'react';
import { Code } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

type LSPOperation =
  | 'goToDefinition'
  | 'findReferences'
  | 'hover'
  | 'documentSymbol'
  | 'workspaceSymbol'
  | 'goToImplementation'
  | 'prepareCallHierarchy'
  | 'incomingCalls'
  | 'outgoingCalls';

interface LSPInput {
  operation: LSPOperation;
  filePath: string;
  line?: number;
  character?: number;
}

const formatResult = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const extractFilename = (path: string): string => path.split('/').pop() ?? path;

const LSPToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as LSPInput | undefined;
  const operation = input?.operation;
  const filePath = input?.filePath ?? '';
  const line = input?.line;
  const character = input?.character;

  const filename = extractFilename(filePath);
  const location =
    line !== undefined ? `:${line}${character !== undefined ? `:${character}` : ''}` : '';
  const opLabel = operation ?? 'query';

  const result = formatResult(tool.result);
  const hasExpandableContent =
    filePath.length > 0 || (result.length > 0 && tool.status === 'completed');

  return (
    <ToolCard
      icon={<Code className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `LSP ${opLabel}: ${filename}${location}`;
          case 'failed':
            return `LSP ${opLabel} failed: ${filename}${location}`;
          default:
            return `LSP running ${opLabel}: ${filename}${location}`;
        }
      }}
      loadingContent={`Running ${opLabel}...`}
      error={tool.error}
      expandable={hasExpandableContent}
    >
      {hasExpandableContent && (
        <div className="space-y-3 border-t border-border/50 p-3 dark:border-border-dark/50">
          {filePath && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                File
              </div>
              <div className="truncate rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                {filePath}
                {location}
              </div>
            </div>
          )}
          {result.length > 0 && tool.status === 'completed' && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Result
              </div>
              <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                <pre className="whitespace-pre-wrap break-all">{result}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolCard>
  );
};

export const LSPTool = memo(LSPToolInner);
