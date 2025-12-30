import React from 'react';
import { ListTodo, CheckCircle2, Circle, Clock } from 'lucide-react';
import type { ToolAggregate } from '@/types';
import { ToolCard } from './common';

interface Todo {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoWriteProps {
  tool: ToolAggregate;
}

export const TodoWrite: React.FC<TodoWriteProps> = ({ tool }) => {
  const todos = Array.isArray(tool.input?.todos) ? tool.input.todos : [];
  const todoCount = todos.length;
  const completedCount = todos.filter((todo) => todo.status === 'completed').length;
  const inProgressCount = todos.filter((todo) => todo.status === 'in_progress').length;
  const pendingCount = todos.filter((todo) => todo.status === 'pending').length;

  const summaryMeta =
    completedCount > 0 || inProgressCount > 0 || pendingCount > 0 ? (
      <>
        {completedCount > 0 && (
          <span className="text-success-600 dark:text-success-400">{completedCount} done</span>
        )}
        {inProgressCount > 0 && (
          <span className="text-brand-600 dark:text-brand-400">{inProgressCount} active</span>
        )}
        {pendingCount > 0 && (
          <span className="text-text-tertiary dark:text-text-dark-tertiary">
            {pendingCount} pending
          </span>
        )}
      </>
    ) : null;

  const toolStatus = tool.status;
  const errorMessage = tool.error;

  const getTodoStatusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-success-600 dark:text-success-400" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-brand-600 dark:text-brand-400" />;
      case 'pending':
      default:
        return <Circle className="h-4 w-4 text-text-quaternary dark:text-text-dark-quaternary" />;
    }
  };

  return (
    <ToolCard
      icon={<ListTodo className="h-3.5 w-3.5 text-text-secondary dark:text-text-dark-tertiary" />}
      status={toolStatus}
      title={(status) => {
        switch (status) {
          case 'completed':
            return `Updated todos (${todoCount} item${todoCount !== 1 ? 's' : ''})`;
          case 'failed':
            return 'Failed to update todos';
          default:
            return 'Updating todos';
        }
      }}
      loadingContent="Updating todo list..."
      error={errorMessage}
      expandable={todoCount > 0 && toolStatus === 'completed'}
    >
      {todoCount > 0 && toolStatus === 'completed' && (
        <div className="border-t border-border/50 p-3 dark:border-border-dark/50">
          <div className="mb-2 flex gap-3 text-2xs">{summaryMeta}</div>
          <div className="space-y-1">
            {todos.map((todo, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-md py-1 transition-colors hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary/30"
              >
                <div className="flex-shrink-0">{getTodoStatusIcon(todo.status)}</div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs ${
                      todo.status === 'completed'
                        ? 'text-text-tertiary line-through dark:text-text-dark-tertiary'
                        : 'text-text-primary dark:text-text-dark-primary'
                    }`}
                  >
                    {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
};
