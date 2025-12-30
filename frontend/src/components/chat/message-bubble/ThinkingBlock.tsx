import React, { useState, useMemo, memo } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { Button } from '@/components/ui';

interface ThinkingBlockProps {
  content: string;
  isActiveThinking: boolean;
}

const ThinkingBlockInner: React.FC<ThinkingBlockProps> = ({ content, isActiveThinking }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  const previewText = useMemo(() => {
    if (!content) return '';
    const lines = content.split('\n');
    const firstLine = lines[0];
    if (firstLine.length > 80) {
      return firstLine.substring(0, 80) + '...';
    }
    if (lines.length > 1) {
      return firstLine + '...';
    }
    return firstLine;
  }, [content]);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface-secondary transition-all duration-200 dark:border-border-dark dark:bg-surface-dark-secondary">
      <Button
        onClick={toggleExpanded}
        variant="unstyled"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
      >
        <div className="flex-shrink-0 rounded-md bg-surface-tertiary p-1.5 dark:bg-surface-dark-tertiary">
          <Brain className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary dark:text-text-dark-primary">
              {isActiveThinking ? 'Thinking' : 'Thought process'}
            </span>
            {isActiveThinking && (
              <div className="flex gap-0.5">
                <div
                  className="h-1 w-1 animate-bounce rounded-full bg-text-secondary dark:bg-text-dark-tertiary"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="h-1 w-1 animate-bounce rounded-full bg-text-secondary dark:bg-text-dark-tertiary"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="h-1 w-1 animate-bounce rounded-full bg-text-secondary dark:bg-text-dark-tertiary"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            )}
            {!isExpanded && content && (
              <span className="max-w-52 truncate text-2xs text-text-secondary dark:text-text-dark-tertiary">
                {previewText}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-text-tertiary dark:text-text-dark-tertiary">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </Button>

      <div
        className={`transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        } overflow-y-auto`}
      >
        {content && (
          <div className="px-3 pb-2">
            <div className="whitespace-pre-wrap text-xs leading-relaxed text-text-secondary dark:text-text-dark-secondary">
              {content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ThinkingBlock = memo(ThinkingBlockInner);
