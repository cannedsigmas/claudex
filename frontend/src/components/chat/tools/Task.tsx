import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard, CollapsibleButton } from './common';
import { getToolComponent } from './registry';

interface TaskProps {
  tool: ToolAggregate;
}

export const Task: React.FC<TaskProps> = ({ tool }) => {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  useEffect(() => {
    setPromptExpanded(false);
    setToolsExpanded(false);
  }, [tool.id]);

  const prompt = tool.input?.prompt as string | undefined;
  const description = tool.input?.description as string | undefined;
  const subagentType = tool.input?.subagent_type as string | undefined;

  const toolStatus = tool.status;
  const errorMessage = tool.error;

  const hasDetails = Boolean(prompt) || tool.children.length > 0;

  return (
    <ToolCard
      icon={<Bot className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={toolStatus}
      title={(status) => {
        const type = subagentType || 'general-purpose';
        switch (status) {
          case 'completed':
            return `Task completed (${type})`;
          case 'failed':
            return `Task failed (${type})`;
          case 'started':
            return `Running task (${type})`;
          default:
            return `Task pending (${type})`;
        }
      }}
      error={errorMessage}
      statusDetail={
        description ? (
          <p className="mt-1 text-xs text-text-tertiary dark:text-text-dark-tertiary">
            {description}
          </p>
        ) : undefined
      }
      expandable={hasDetails}
    >
      {hasDetails && (
        <div className="border-t border-border/50 dark:border-border-dark/50">
          <div className="space-y-3 p-3">
            {prompt && (
              <div className="space-y-2">
                <CollapsibleButton
                  label="Prompt"
                  isExpanded={promptExpanded}
                  onToggle={() => setPromptExpanded((value) => !value)}
                  fullWidth
                />
                {promptExpanded && (
                  <div className="whitespace-pre-wrap break-words rounded bg-black/5 p-2 font-mono text-2xs text-text-secondary dark:bg-white/5 dark:text-text-dark-tertiary">
                    {prompt}
                  </div>
                )}
              </div>
            )}

            {tool.children.length > 0 && (
              <div className="space-y-2">
                <CollapsibleButton
                  label="Tools Used"
                  isExpanded={toolsExpanded}
                  onToggle={() => setToolsExpanded((value) => !value)}
                  count={tool.children.length}
                  fullWidth
                />
                {toolsExpanded && (
                  <div className="space-y-2">
                    {tool.children.map((childTool) => {
                      const Component = getToolComponent(childTool.name);
                      return (
                        <div
                          key={childTool.id}
                          className="border-l border-border/60 pl-2 dark:border-border-dark/60"
                        >
                          <Component tool={childTool} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </ToolCard>
  );
};
