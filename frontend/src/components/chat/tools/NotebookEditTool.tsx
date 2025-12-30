import { memo } from 'react';
import { BookOpen } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

type EditMode = 'replace' | 'insert' | 'delete';

interface NotebookEditInput {
  notebook_path: string;
  new_source: string;
  cell_id?: string;
  cell_type?: 'code' | 'markdown';
  edit_mode?: EditMode;
}

const extractFilename = (path: string): string => path.split('/').pop() ?? path;

const NotebookEditToolInner: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const input = tool.input as NotebookEditInput | undefined;
  const notebookPath = input?.notebook_path ?? '';
  const editMode = input?.edit_mode ?? 'replace';
  const newSource = input?.new_source ?? '';
  const cellId = input?.cell_id;
  const cellType = input?.cell_type;

  const filename = extractFilename(notebookPath);
  const inProgressLabels: Record<EditMode, string> = {
    replace: 'Editing cell in',
    insert: 'Inserting cell in',
    delete: 'Deleting cell in',
  };
  const completedLabels: Record<EditMode, string> = {
    replace: 'Edited cell in',
    insert: 'Inserted cell in',
    delete: 'Deleted cell in',
  };

  const hasExpandableContent = notebookPath.length > 0 || newSource.length > 0 || cellId;

  return (
    <ToolCard
      icon={<BookOpen className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={tool.status}
      title={(status) => {
        const suffix = filename ? ` ${filename}` : '';
        switch (status) {
          case 'completed':
            return `${completedLabels[editMode] ?? editMode}${suffix}`;
          case 'failed':
            return `Failed to ${editMode} cell in${suffix}`;
          default:
            return `${inProgressLabels[editMode] ?? editMode}${suffix}`;
        }
      }}
      loadingContent="Editing notebook..."
      error={tool.error}
      expandable={Boolean(hasExpandableContent)}
    >
      {hasExpandableContent && (
        <div className="space-y-3 border-t border-border/50 p-3 dark:border-border-dark/50">
          {notebookPath && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Notebook
              </div>
              <div className="truncate rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                {notebookPath}
              </div>
            </div>
          )}
          <div className="flex gap-4">
            {cellId && (
              <div className="space-y-0.5">
                <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                  Cell ID
                </div>
                <div className="rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                  {cellId}
                </div>
              </div>
            )}
            {cellType && (
              <div className="space-y-0.5">
                <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                  Type
                </div>
                <div className="rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                  {cellType}
                </div>
              </div>
            )}
          </div>
          {newSource && editMode !== 'delete' && (
            <div className="space-y-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-tertiary dark:text-text-dark-tertiary">
                Content
              </div>
              <div className="max-h-48 overflow-auto rounded bg-black/5 px-2 py-1.5 font-mono text-xs text-text-secondary dark:bg-white/5 dark:text-text-dark-secondary">
                <pre className="whitespace-pre-wrap break-all">{newSource}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolCard>
  );
};

export const NotebookEditTool = memo(NotebookEditToolInner);
