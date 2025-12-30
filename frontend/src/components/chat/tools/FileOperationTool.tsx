import React, { useCallback, useState } from 'react';
import { FileSearch, FileEdit as FileEditIcon, FilePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolAggregate, LineReview, ToolComponent } from '@/types';
import { ExpandableSection, ToolCard, DiffViewer, ReviewInput } from './common';
import { useReviewStore } from '@/store';

interface FileOperationToolProps {
  tool: ToolAggregate;
  variant: 'read' | 'edit' | 'write';
  chatId?: string;
}

interface SelectedLinesState {
  start: number;
  end: number;
  code: string;
  type: 'insert' | 'delete' | 'normal';
}

interface DiffContentProps {
  label: string;
  oldContent: string;
  newContent: string;
  filePath: string;
  toolId: string;
  chatId?: string;
  selectedLines?: SelectedLinesState | null;
  onLineSelect?: (
    start: number,
    end: number,
    code: string,
    type: 'insert' | 'delete' | 'normal',
  ) => void;
  onReviewSubmit?: (comment: string) => void;
  onReviewCancel?: () => void;
}

interface OperationConfig {
  icon: LucideIcon;
  titlePrefix: string;
  loadingContent: string;
}

const normalizeContent = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) return result.join('\n');
  if (result === null || result === undefined) return '';
  return JSON.stringify(result, null, 2);
};

const toDisplayString = (value: unknown): string => (typeof value === 'string' ? value : '');

const DiffContent: React.FC<DiffContentProps> = ({
  label,
  oldContent,
  newContent,
  filePath,
  toolId,
  chatId,
  selectedLines,
  onLineSelect,
  onReviewSubmit,
  onReviewCancel,
}) => (
  <ExpandableSection label={label} bodyClassName="p-3">
    <DiffViewer
      oldContent={oldContent}
      newContent={newContent}
      filename={filePath}
      reviewMode={!!chatId}
      operationId={toolId}
      onLineSelect={onLineSelect}
      selectedRange={selectedLines ? { start: selectedLines.start, end: selectedLines.end } : null}
    />
    {selectedLines && chatId && onReviewSubmit && onReviewCancel && (
      <div className="mt-3">
        <ReviewInput
          selectedLines={{ start: selectedLines.start, end: selectedLines.end }}
          fileName={filePath}
          onSubmit={onReviewSubmit}
          onCancel={onReviewCancel}
        />
      </div>
    )}
  </ExpandableSection>
);

const ReadContent: React.FC<{ tool: ToolAggregate }> = ({ tool }) => {
  const content = normalizeContent(tool.result);
  const lineCount = content.split('\n').length;

  if (!content || tool.status !== 'completed') return null;

  return (
    <ExpandableSection
      label={`View file content (${lineCount} line${lineCount !== 1 ? 's' : ''})`}
      bodyClassName="relative"
    >
      <div className="max-h-64 overflow-x-auto font-mono text-xs">
        <div className="flex">
          <div className="flex-shrink-0 select-none border-r border-border px-3 py-3 text-right text-text-tertiary dark:border-border-dark-secondary dark:text-text-dark-tertiary">
            {content.split('\n').map((line: string, idx: number) => {
              const match = line.match(/^\s*(\d+)→/);
              const lineNum = match ? match[1] : String(idx + 1);
              return <div key={idx}>{lineNum}</div>;
            })}
          </div>
          <pre className="flex-1 py-3 pl-4">
            <code className="whitespace-pre text-text-primary dark:text-text-dark-primary">
              {content.split('\n').map((line: string, idx: number) => {
                const lineContent = line.replace(/^\s*\d+→/, '');
                return <div key={idx}>{lineContent || '\u00A0'}</div>;
              })}
            </code>
          </pre>
        </div>
      </div>
    </ExpandableSection>
  );
};

interface TitleConfig {
  inProgress: string;
  completed: string;
  failed: string;
}

const OPERATION_CONFIGS: Record<
  'read' | 'edit' | 'write',
  OperationConfig & { titles: TitleConfig }
> = {
  read: {
    icon: FileSearch,
    titlePrefix: 'Read',
    loadingContent: 'Loading file content...',
    titles: { inProgress: 'Reading', completed: 'Read', failed: 'Failed to read' },
  },
  edit: {
    icon: FileEditIcon,
    titlePrefix: 'Edit',
    loadingContent: 'Applying changes...',
    titles: { inProgress: 'Editing', completed: 'Edited', failed: 'Failed to edit' },
  },
  write: {
    icon: FilePlus,
    titlePrefix: 'Write',
    loadingContent: 'Writing file...',
    titles: { inProgress: 'Writing', completed: 'Wrote', failed: 'Failed to write' },
  },
};

export const FileOperationTool: React.FC<FileOperationToolProps> = ({ tool, variant, chatId }) => {
  const config = OPERATION_CONFIGS[variant];
  const Icon = config.icon;
  const filePath = (tool.input?.file_path as string | undefined) ?? '';
  const toolStatus = tool.status;
  const errorMessage = tool.error;

  const [selectedLines, setSelectedLines] = useState<SelectedLinesState | null>(null);

  const addReview = useReviewStore((state) => state.addReview);

  const handleLineSelect = useCallback(
    (start: number, end: number, code: string, type: 'insert' | 'delete' | 'normal') => {
      setSelectedLines({ start, end, code, type });
    },
    [],
  );

  const handleReviewSubmit = useCallback(
    (comment: string) => {
      if (!selectedLines || !chatId) return;

      const review: LineReview = {
        id: `${tool.id}-${Date.now()}`,
        chatId,
        filePath,
        operationId: tool.id,
        changeType: selectedLines.type,
        lineStart: selectedLines.start,
        lineEnd: selectedLines.end,
        selectedCode: selectedLines.code,
        comment,
        createdAt: new Date().toISOString(),
      };

      addReview(review);
      setSelectedLines(null);
    },
    [selectedLines, chatId, tool.id, filePath, addReview],
  );

  const handleReviewCancel = useCallback(() => {
    setSelectedLines(null);
  }, []);

  const renderContent = () => {
    if (variant === 'read') {
      return <ReadContent tool={tool} />;
    }

    if (variant === 'edit') {
      const oldString = toDisplayString(tool.input?.old_string);
      const newString = toDisplayString(tool.input?.new_string);
      if (!oldString && !newString) return null;

      return (
        <DiffContent
          label="View changes"
          oldContent={oldString}
          newContent={newString}
          filePath={filePath}
          toolId={tool.id}
          chatId={chatId}
          selectedLines={selectedLines}
          onLineSelect={handleLineSelect}
          onReviewSubmit={handleReviewSubmit}
          onReviewCancel={handleReviewCancel}
        />
      );
    }

    const content = typeof tool.input?.content === 'string' ? tool.input.content : '';
    if (!content) return null;
    const lineCount = content.split('\n').length;

    return (
      <DiffContent
        label={`View content (${lineCount} line${lineCount !== 1 ? 's' : ''})`}
        oldContent=""
        newContent={content}
        filePath={filePath}
        toolId={tool.id}
        chatId={chatId}
        selectedLines={selectedLines}
        onLineSelect={handleLineSelect}
        onReviewSubmit={handleReviewSubmit}
        onReviewCancel={handleReviewCancel}
      />
    );
  };

  const hasExpandableContent =
    (variant === 'read' && tool.result && tool.status === 'completed') ||
    (variant === 'edit' &&
      (toDisplayString(tool.input?.old_string) || toDisplayString(tool.input?.new_string))) ||
    (variant === 'write' && typeof tool.input?.content === 'string' && tool.input.content);

  return (
    <ToolCard
      icon={<Icon className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={toolStatus}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `${config.titles.completed} ${filePath}`;
          case 'failed':
            return `${config.titles.failed} ${filePath}`;
          default:
            return `${config.titles.inProgress} ${filePath}`;
        }
      }}
      loadingContent={config.loadingContent}
      error={errorMessage}
      expandable={Boolean(hasExpandableContent)}
    >
      {renderContent()}
    </ToolCard>
  );
};

export const WriteTool: ToolComponent = ({ tool, chatId }) => (
  <FileOperationTool tool={tool} variant="write" chatId={chatId} />
);

export const ReadTool: ToolComponent = ({ tool, chatId }) => (
  <FileOperationTool tool={tool} variant="read" chatId={chatId} />
);

export const EditTool: ToolComponent = ({ tool, chatId }) => (
  <FileOperationTool tool={tool} variant="edit" chatId={chatId} />
);
