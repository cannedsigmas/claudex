import React from 'react';
import { HelpCircle } from 'lucide-react';
import type { ToolAggregate, UserQuestion } from '@/types';
import { ToolCard } from './common';

interface AskUserQuestionProps {
  tool: ToolAggregate;
}

export const AskUserQuestion: React.FC<AskUserQuestionProps> = ({ tool }) => {
  const questions = (tool.input?.questions ?? []) as UserQuestion[];
  const questionCount = questions.length;
  const toolStatus = tool.status;
  const errorMessage = tool.error;

  const resultData = tool.result as { answers?: Record<string, string | string[]> } | undefined;
  const answers = resultData?.answers;

  return (
    <ToolCard
      icon={<HelpCircle className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={toolStatus}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `User answered ${questionCount} question${questionCount !== 1 ? 's' : ''}`;
          case 'failed':
            return 'Question cancelled or failed';
          default:
            return 'Waiting for user response...';
        }
      }}
      loadingContent="Please answer the questions in the popup..."
      error={errorMessage}
      expandable={questionCount > 0 && toolStatus === 'completed' && !!answers}
    >
      {questionCount > 0 && toolStatus === 'completed' && answers && (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <div className="space-y-3">
            {questions.map((q, index) => {
              const answer = answers[`question_${index}`];
              return (
                <div key={index} className="space-y-1">
                  <p className="text-xs font-medium text-text-primary dark:text-text-dark-primary">
                    {q.header && (
                      <span className="text-brand-600 dark:text-brand-400">{q.header}: </span>
                    )}
                    {q.question}
                  </p>
                  {answer && (
                    <p className="border-l-2 border-brand-500 pl-2 text-xs text-text-secondary dark:text-text-dark-secondary">
                      {Array.isArray(answer) ? answer.join(', ') : answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ToolCard>
  );
};
