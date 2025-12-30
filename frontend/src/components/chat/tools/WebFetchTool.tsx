import { memo } from 'react';
import { Globe } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

interface WebFetchInput {
  url: string;
  prompt: string;
}

const formatResult = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.length > 30 ? `${url.slice(0, 27)}...` : url;
  }
};

const WebFetchToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as WebFetchInput | undefined;
  const url = input?.url ?? '';
  const prompt = input?.prompt ?? '';

  const domain = extractDomain(url) || 'content';
  const result = formatResult(tool.result);
  const hasExpandableContent = url.length > 0 || (result.length > 0 && tool.status === 'completed');

  return (
    <ToolCard
      icon={<Globe className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={tool.status}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Fetched: ${domain}`;
          case 'failed':
            return `Failed to fetch: ${domain}`;
          default:
            return `Fetching: ${domain}`;
        }
      }}
      loadingContent="Fetching content..."
      error={tool.error}
      expandable={hasExpandableContent}
    >
      {hasExpandableContent && (
        <div className="space-y-3 border-t border-border/50 p-3 dark:border-border-dark/50">
          {url && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                URL
              </div>
              <div className="truncate rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                {url}
              </div>
            </div>
          )}
          {prompt && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Prompt
              </div>
              <div className="rounded bg-black/5 px-2 py-1.5 text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                {prompt}
              </div>
            </div>
          )}
          {result.length > 0 && tool.status === 'completed' && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Extracted content
              </div>
              <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                <pre className="whitespace-pre-wrap break-all">{result}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolCard>
  );
};

export const WebFetchTool = memo(WebFetchToolInner);
