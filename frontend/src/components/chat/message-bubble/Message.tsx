import { memo, useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Copy, RotateCcw } from 'lucide-react';
import { MessageContent } from './MessageContent';
import { UserAvatar, BotAvatar } from './MessageAvatars';
import { useModelsQuery } from '@/hooks/queries';
import type { MessageAttachment } from '@/types';
import { useRestoreCheckpointMutation } from '@/hooks/queries';
import { ConfirmDialog, LoadingOverlay, Button, Spinner, Badge } from '@/components/ui';
import toast from 'react-hot-toast';
import { useChatContext } from '@/hooks/useChatContext';

export interface MessageProps {
  id: string;
  content: string;
  isBot: boolean;
  attachments?: MessageAttachment[];
  copiedMessageId: string | null;
  onCopy: (content: string, id: string) => void;
  error?: string | null;
  isThisMessageStreaming: boolean;
  isGloballyStreaming: boolean;
  createdAt?: string;
  modelId?: string;
  isLastBotMessageWithCommit?: boolean;
  onRestoreSuccess?: () => void;
}

export const Message = memo(function Message({
  id,
  content,
  isBot,
  attachments,
  copiedMessageId,
  onCopy,
  isThisMessageStreaming,
  isGloballyStreaming,
  createdAt,
  modelId,
  isLastBotMessageWithCommit,
  onRestoreSuccess,
}: MessageProps) {
  const { chatId, sandboxId } = useChatContext();
  const { data: models = [] } = useModelsQuery();
  const [isRestoring, setIsRestoring] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const restoreMutation = useRestoreCheckpointMutation({
    onSuccess: () => {
      setIsRestoring(false);
      setShowConfirmDialog(false);
      toast.success('Checkpoint restored successfully');
      onRestoreSuccess?.();
    },
    onError: () => {
      toast.error('Failed to restore checkpoint. Please try again.');
      setIsRestoring(false);
      setShowConfirmDialog(false);
    },
  });

  const handleRestore = useCallback(() => {
    if (!chatId || isRestoring) return;
    setShowConfirmDialog(true);
  }, [chatId, isRestoring]);

  const handleConfirmRestore = useCallback(() => {
    if (!chatId || !id) return;
    setIsRestoring(true);
    restoreMutation.mutate({ chatId, messageId: id, sandboxId });
  }, [chatId, id, sandboxId, restoreMutation]);

  const formattedDate = useMemo(
    () => (createdAt ? new Date(createdAt).toLocaleString() : ''),
    [createdAt],
  );

  const modelName = useMemo(() => {
    if (!modelId) return null;
    const model = models.find((m) => m.model_id === modelId);
    return model?.name || modelId;
  }, [modelId, models]);

  return (
    <div className="group rounded-lg px-4 py-2 sm:rounded-2xl sm:px-6 sm:py-3">
      <div className="space-y-1">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex-shrink-0">{isBot ? <BotAvatar /> : <UserAvatar />}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
            <span className="font-medium text-text-secondary dark:text-text-dark-tertiary">
              {isBot ? 'Claudex' : 'You'}
            </span>
            {formattedDate && (
              <>
                <span className="text-text-quaternary dark:text-text-dark-quaternary">•</span>
                <span className="text-text-tertiary dark:text-text-dark-tertiary">
                  {formattedDate}
                </span>
              </>
            )}
            {isBot && modelId && (
              <>
                <span className="text-text-quaternary dark:text-text-dark-quaternary">•</span>
                <Badge>{modelName}</Badge>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-2 sm:pl-14">
          <div
            className={`prose prose-sm max-w-none break-words ${
              isBot
                ? 'text-text-primary dark:text-text-dark-primary'
                : 'text-text-primary dark:text-text-dark-secondary'
            }`}
          >
            <MessageContent
              content={content}
              isBot={isBot}
              attachments={attachments}
              isStreaming={isThisMessageStreaming}
              chatId={chatId}
            />
          </div>

          {isBot && content.trim() && (
            <div className="pt-2">
              <div className="mt-3 flex items-center gap-2">
                <Button
                  onClick={() => onCopy(content, id)}
                  variant="unstyled"
                  className={`relative min-h-[44px] min-w-[44px] overflow-hidden rounded-xl p-2.5 transition-all duration-200 sm:min-h-0 sm:min-w-0 sm:p-2 ${
                    isThisMessageStreaming
                      ? 'pointer-events-none opacity-0'
                      : copiedMessageId === id
                        ? 'bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success-400'
                        : 'text-text-secondary opacity-70 hover:bg-surface-secondary hover:text-text-primary hover:opacity-100 dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary'
                  }`}
                >
                  <div className="relative z-10 flex items-center gap-1.5">
                    {copiedMessageId === id ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="hidden text-xs sm:inline">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span className="hidden text-xs sm:inline">Copy</span>
                      </>
                    )}
                  </div>
                </Button>

                {!isLastBotMessageWithCommit && (
                  <Button
                    onClick={handleRestore}
                    disabled={isRestoring}
                    variant="unstyled"
                    className={`relative rounded-xl p-2.5 transition-all duration-200 sm:p-2 ${
                      isThisMessageStreaming || isGloballyStreaming
                        ? 'pointer-events-none opacity-0'
                        : isRestoring
                          ? 'cursor-not-allowed opacity-50'
                          : 'text-text-secondary opacity-70 hover:bg-surface-secondary hover:text-text-primary hover:opacity-100 dark:text-text-dark-secondary dark:hover:bg-surface-dark-hover dark:hover:text-text-dark-primary'
                    }`}
                    title="Restore to this message"
                  >
                    <div className="relative z-10 flex items-center gap-1.5">
                      {isRestoring ? (
                        <>
                          <Spinner size="md" />
                          <span className="hidden text-xs sm:inline">Restoring...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          <span className="hidden text-xs sm:inline">Restore</span>
                        </>
                      )}
                    </div>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmRestore}
        title="Restore to This Message"
        message="Restore conversation to this message? Newer messages will be deleted."
        confirmLabel="Restore"
        cancelLabel="Cancel"
      />

      <LoadingOverlay isOpen={isRestoring} message="Restoring checkpoint..." />
    </div>
  );
});
