import React, { JSX, memo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, X } from 'lucide-react';
import type { ToolEventStatus } from '@/types';

const statusIcon: Record<ToolEventStatus, JSX.Element> = {
  completed: <CheckCircle2 className="h-4 w-4 text-success-600 dark:text-success-400" />,
  failed: <X className="h-4 w-4 text-error-600 dark:text-error-400" />,
  started: <Circle className="h-4 w-4 animate-pulse text-brand-600 dark:text-brand-400" />,
};

type ToolCardTitle = string | ((status: ToolEventStatus) => string);

type Content = React.ReactNode | string | null | undefined;

interface ToolCardProps {
  icon: React.ReactNode;
  status: ToolEventStatus;
  title: ToolCardTitle;
  actions?: React.ReactNode;
  loadingContent?: Content;
  error?: Content;
  statusDetail?: Content;
  children?: React.ReactNode;
  className?: string;
  expandable?: boolean;
  defaultExpanded?: boolean;
}

const ToolCardInner: React.FC<ToolCardProps> = ({
  icon,
  status,
  title,
  actions,
  loadingContent,
  error,
  statusDetail,
  children,
  className = '',
  expandable = false,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const resolvedTitle = typeof title === 'function' ? title(status) : title;

  const hasExpandableContent = expandable && children;
  const showChildren = !expandable || expanded;

  const headerContent = (
    <>
      <div className="flex-shrink-0 rounded-md bg-black/5 p-1.5 dark:bg-white/5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className="max-w-md overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-text-primary dark:text-text-dark-primary"
            title={resolvedTitle}
          >
            {resolvedTitle}
          </span>
          <div className="flex items-center gap-2">
            {statusIcon[status]}
            {hasExpandableContent &&
              (expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-text-tertiary dark:text-text-dark-tertiary" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-text-tertiary dark:text-text-dark-tertiary" />
              ))}
            {!expandable && actions}
          </div>
        </div>
        {status === 'started' &&
          loadingContent &&
          (React.isValidElement(loadingContent) ? (
            loadingContent
          ) : (
            <p className="mt-0.5 text-2xs text-text-tertiary dark:text-text-dark-tertiary">
              {loadingContent}
            </p>
          ))}
        {status === 'failed' &&
          error &&
          (React.isValidElement(error) ? (
            error
          ) : (
            <p className="mt-0.5 text-2xs text-error-600 dark:text-error-500">{error}</p>
          ))}
        {statusDetail &&
          (React.isValidElement(statusDetail) ? (
            statusDetail
          ) : (
            <p className="mt-0.5 text-2xs text-text-tertiary dark:text-text-dark-tertiary">
              {statusDetail}
            </p>
          ))}
      </div>
    </>
  );

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-border bg-surface-secondary transition-all duration-200 dark:border-border-dark dark:bg-surface-dark-secondary ${className}`}
    >
      {hasExpandableContent ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{headerContent}</div>
      )}
      {showChildren && children}
    </div>
  );
};

export const ToolCard = memo(ToolCardInner);
