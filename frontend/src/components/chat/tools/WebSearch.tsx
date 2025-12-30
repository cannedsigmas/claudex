import React, { useMemo } from 'react';
import { logger } from '@/utils/logger';
import { Search, ExternalLink, Globe } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

interface WebSearchProps {
  tool: ToolAggregate;
}

interface SearchSource {
  title: string;
  url: string;
}

interface ZaiSearchResult {
  refer: string;
  title: string;
  link: string;
  media: string;
  content: string;
  icon: string;
  publish_date: string;
}

export const WebSearch: React.FC<WebSearchProps> = ({ tool }) => {
  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    } catch (error) {
      logger.error('Favicon URL parse failed', 'WebSearch', error);
      return null;
    }
  };

  const parseZaiSearchResults = (result: unknown): SearchSource[] => {
    try {
      if (!Array.isArray(result)) {
        return [];
      }

      const firstItem = result[0];
      if (!firstItem || firstItem.type !== 'text' || typeof firstItem.text !== 'string') {
        return [];
      }

      const zaiResults = JSON.parse(firstItem.text) as ZaiSearchResult[];
      return zaiResults.map((item) => ({
        title: item.title,
        url: item.link,
      }));
    } catch {
      return [];
    }
  };

  const parseClaudeSearchResults = (result: string): SearchSource[] => {
    try {
      const linksMatch = result.match(/Links:\s*(\[[\s\S]*?\])(?=\s*\n|$)/);
      if (linksMatch?.[1]) {
        return JSON.parse(linksMatch[1]) as SearchSource[];
      }
    } catch {
      return [];
    }
    return [];
  };

  const query = ((tool.input?.query || tool.input?.search_query) as string | undefined) ?? '';
  const toolStatus = tool.status;
  const errorMessage = tool.error;

  const sources: SearchSource[] = useMemo(() => {
    if (typeof tool.result === 'string') {
      const claudeResults = parseClaudeSearchResults(tool.result);
      if (claudeResults.length > 0) {
        return claudeResults;
      }
    }

    const zaiResults = parseZaiSearchResults(tool.result);
    if (zaiResults.length > 0) {
      return zaiResults;
    }

    return [];
  }, [tool.result]);

  const canShowSources = sources.length > 0;

  return (
    <ToolCard
      icon={<Search className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={toolStatus}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Searched: ${query}`;
          case 'failed':
            return `Search failed: ${query}`;
          default:
            return `Searching: ${query}`;
        }
      }}
      loadingContent={
        <div className="mt-0.5 flex items-center gap-1.5">
          <div className="flex space-x-1">
            <div
              className="h-1 w-1 animate-bounce rounded-full bg-brand-600 dark:bg-brand-400"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="h-1 w-1 animate-bounce rounded-full bg-brand-600 dark:bg-brand-400"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="h-1 w-1 animate-bounce rounded-full bg-brand-600 dark:bg-brand-400"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <p className="text-2xs text-text-tertiary dark:text-text-dark-tertiary">
            Searching the web
          </p>
        </div>
      }
      error={errorMessage}
      expandable={canShowSources}
    >
      {canShowSources && (
        <div className="border-t border-border/50 dark:border-border-dark/50">
          <div className="px-4 pb-4">
            <div className="space-y-1.5">
              {sources.map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/item relative block rounded-lg px-4 py-3 transition-all duration-200 hover:bg-surface-secondary active:bg-surface-tertiary dark:hover:bg-surface-dark-secondary/50 dark:active:bg-surface-dark-secondary/70"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
                      {getFaviconUrl(source.url) ? (
                        <>
                          <img
                            src={getFaviconUrl(source.url)!}
                            alt=""
                            className="h-5 w-5"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                              event.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <Globe className="hidden h-4 w-4 text-text-quaternary dark:text-text-dark-quaternary" />
                        </>
                      ) : (
                        <Globe className="h-4 w-4 text-text-quaternary dark:text-text-dark-quaternary" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="mb-0.5 text-xs font-medium leading-tight text-text-primary transition-colors duration-200 dark:text-text-dark-primary">
                        {source.title}
                      </h4>

                      <p className="text-xs leading-relaxed text-text-quaternary dark:text-text-dark-quaternary">
                        {(() => {
                          try {
                            return new URL(source.url).hostname.replace('www.', '');
                          } catch (error) {
                            logger.error('Favicon URL parse failed', 'WebSearch', error);
                            return source.url;
                          }
                        })()}
                      </p>
                    </div>

                    <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-text-quaternary opacity-0 transition-all duration-200 group-hover/item:opacity-100 dark:text-text-dark-quaternary" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </ToolCard>
  );
};
