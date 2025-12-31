import { memo } from 'react';
import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  padding: { top: 4 },
  automaticLayout: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
  snippetSuggestions: 'inline',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  lineHeight: 1.4,
  renderLineHighlight: 'all',
  scrollbar: {
    useShadows: false,
    vertical: 'visible',
    horizontal: 'visible',
    horizontalScrollbarSize: 10,
    verticalScrollbarSize: 10,
  },
} as const;

export interface ContentProps {
  content: string;
  language: string;
  isReadOnly: boolean;
  onChange: (value: string | undefined) => void;
  onMount: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => void;
  theme: string;
}

export const Content = memo(function Content({
  content,
  language,
  isReadOnly,
  onChange,
  onMount,
  theme,
}: ContentProps) {
  return (
    <div className="h-full">
      <Editor
        height="100%"
        language={language}
        path={`file://${language}`}
        value={content}
        onChange={onChange}
        theme={theme}
        options={{
          ...EDITOR_OPTIONS,
          readOnly: isReadOnly,
        }}
        onMount={onMount}
        loading={
          <div
            className={`flex h-full items-center justify-center text-text-secondary dark:text-text-dark-secondary ${theme === 'custom-light' ? 'bg-surface-secondary' : 'bg-surface-dark-secondary'}`}
          >
            Loading editor...
          </div>
        }
        className={theme === 'custom-light' ? 'bg-surface-secondary' : 'bg-surface-dark-secondary'}
      />
    </div>
  );
});
