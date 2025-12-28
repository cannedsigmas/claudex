import { useRef, useState, useCallback, useEffect, useLayoutEffect, memo, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { findLastBotMessageIndex } from '@/utils/message';
import { Message } from '@/components/chat/message-bubble/Message';
import { Input } from '@/components/chat/message-input/Input';
import { ChatSkeleton } from './ChatSkeleton';
import { LoadingIndicator } from './LoadingIndicator';
import { ScrollButton } from './ScrollButton';
import { ErrorMessage } from './ErrorMessage';
import { Spinner } from '@/components/ui';
import type {
  Message as MessageType,
  FileStructure,
  CustomAgent,
  CustomCommand,
  CustomPrompt,
} from '@/types';
import { useStreamStore } from '@/store';
import { ChatProvider } from '@/contexts/ChatContext';

const SCROLL_THRESHOLD_PERCENT = 20;

export interface ChatProps {
  messages: MessageType[];
  copiedMessageId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  isInitialLoading?: boolean;
  error: Error | null;
  onCopy: (content: string, id: string) => void;
  inputMessage: string;
  setInputMessage: (message: string) => void;
  onMessageSend: (e: React.FormEvent) => void;
  onStopStream: () => void;
  onAttach?: (files: File[]) => void;
  attachedFiles?: File[] | null;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  contextUsage?: {
    tokensUsed: number;
    contextWindow: number;
  };
  sandboxId?: string;
  chatId?: string;
  onDismissError?: () => void;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onRestoreSuccess?: () => void;
  fileStructure?: FileStructure[];
  customAgents?: CustomAgent[];
  customSlashCommands?: CustomCommand[];
  customPrompts?: CustomPrompt[];
}

export const Chat = memo(function Chat({
  messages,
  copiedMessageId,
  isLoading,
  isStreaming,
  isInitialLoading = false,
  error,
  onCopy,
  inputMessage,
  setInputMessage,
  onMessageSend,
  onStopStream,
  onAttach,
  attachedFiles,
  selectedModelId,
  onModelChange,
  contextUsage,
  sandboxId,
  chatId,
  onDismissError,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  onRestoreSuccess,
  fileStructure = [],
  customAgents = [],
  customSlashCommands = [],
  customPrompts = [],
}: ChatProps) {
  const activeStreams = useStreamStore((state) => state.activeStreams);
  const streamingMessageIds = useMemo(() => {
    const ids: string[] = [];
    activeStreams.forEach((stream) => {
      if (stream.chatId === chatId && stream.isActive) {
        ids.push(stream.messageId);
      }
    });
    return ids;
  }, [activeStreams, chatId]);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadMoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasScrolledToBottom = useRef(false);
  const prevScrollHeight = useRef<number>(0);
  const prevContentHeight = useRef<number>(0);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    hasScrolledToBottom.current = false;
    prevScrollHeight.current = 0;
    isNearBottomRef.current = true;
  }, [chatId]);

  const { ref: loadMoreRef, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && fetchNextPage) {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }

      loadMoreTimeoutRef.current = setTimeout(() => {
        if (!isFetchingNextPage) {
          if (chatWindowRef.current) {
            prevScrollHeight.current = chatWindowRef.current.scrollHeight;
          }
          fetchNextPage();
        }
      }, 100);
    }

    return () => {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }
    };
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useLayoutEffect(() => {
    const container = chatWindowRef.current;
    if (container && prevScrollHeight.current > 0 && !isInitialLoading) {
      const scrollDiff = container.scrollHeight - prevScrollHeight.current;
      if (scrollDiff > 0) {
        container.scrollTop += scrollDiff;
      }
      prevScrollHeight.current = 0;
    }
  }, [messages.length, isInitialLoading]);

  useLayoutEffect(() => {
    const container = chatWindowRef.current;
    if (container && !isInitialLoading && messages.length > 0 && !hasScrolledToBottom.current) {
      if (messages[0]?.chat_id !== chatId) return;
      container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
      hasScrolledToBottom.current = true;
    }
  }, [chatId, isInitialLoading, messages]);

  useEffect(() => {
    if (isStreaming && isNearBottomRef.current && chatWindowRef.current) {
      chatWindowRef.current.scrollTo({
        top: chatWindowRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [isStreaming, messages]);

  const scrollToBottom = useCallback(() => {
    const container = chatWindowRef.current;
    if (container) {
      setShowScrollButton(false);

      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  const checkIfNearBottom = useCallback(() => {
    const container = chatWindowRef.current;
    if (!container) return false;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const thresholdPixels = (clientHeight * SCROLL_THRESHOLD_PERCENT) / 100;

    return distanceFromBottom <= thresholdPixels;
  }, []);

  const handleScroll = useCallback(() => {
    const container = chatWindowRef.current;
    if (!container) return;

    const isAtBottom = checkIfNearBottom();
    isNearBottomRef.current = isAtBottom;
    const shouldShow = !isAtBottom;

    setShowScrollButton((prev) => {
      if (prev === shouldShow) return prev;
      return shouldShow;
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, [checkIfNearBottom]);

  useEffect(() => {
    const container = chatWindowRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll();

      const currentTimeoutRef = timeoutRef.current;

      return () => {
        if (currentTimeoutRef) {
          clearTimeout(currentTimeoutRef);
        }
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    const scrollContainer = chatWindowRef.current;
    if (!messagesContainer || !scrollContainer) return;

    prevContentHeight.current = messagesContainer.getBoundingClientRect().height;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;
        const heightIncreased = newHeight > prevContentHeight.current;

        if (heightIncreased && isNearBottomRef.current) {
          if (autoScrollTimeoutRef.current) {
            clearTimeout(autoScrollTimeoutRef.current);
          }
          autoScrollTimeoutRef.current = setTimeout(() => {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: 'smooth',
            });
          }, 100);
        }

        prevContentHeight.current = newHeight;
      }
    });

    resizeObserver.observe(messagesContainer);
    return () => {
      resizeObserver.disconnect();
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, [isInitialLoading, messages.length]);

  const lastBotMessageIndex = useMemo(() => findLastBotMessageIndex(messages), [messages]);

  return (
    <ChatProvider
      chatId={chatId}
      sandboxId={sandboxId}
      fileStructure={fileStructure}
      customAgents={customAgents}
      customSlashCommands={customSlashCommands}
      customPrompts={customPrompts}
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          ref={chatWindowRef}
          className="scrollbar-thin scrollbar-thumb-border-secondary dark:scrollbar-thumb-border-dark hover:scrollbar-thumb-text-quaternary dark:hover:scrollbar-thumb-border-dark-hover scrollbar-track-transparent flex-1 overflow-y-auto overflow-x-hidden"
        >
          {isInitialLoading && messages.length === 0 ? (
            <ChatSkeleton messageCount={3} className="py-4" />
          ) : (
            <div ref={messagesContainerRef} className="w-full lg:mx-auto lg:max-w-3xl">
              {hasNextPage && (
                <div ref={loadMoreRef} className="flex h-4 items-center justify-center p-4">
                  {isFetchingNextPage && (
                    <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-text-dark-secondary">
                      <Spinner size="xs" />
                      Loading older messages...
                    </div>
                  )}
                </div>
              )}
              {messages.map((msg, index) => {
                const messageIsStreaming = streamingMessageIds.includes(msg.id);
                const isLastBotMessage = msg.is_bot && index === lastBotMessageIndex;

                return (
                  <Message
                    key={msg.id}
                    id={msg.id}
                    content={msg.content}
                    isBot={msg.is_bot}
                    attachments={msg.attachments}
                    copiedMessageId={copiedMessageId}
                    onCopy={onCopy}
                    isThisMessageStreaming={messageIsStreaming}
                    isGloballyStreaming={isStreaming}
                    createdAt={msg.created_at}
                    modelId={msg.model_id}
                    isLastBotMessageWithCommit={isLastBotMessage}
                    onRestoreSuccess={onRestoreSuccess}
                  />
                );
              })}
              {error && <ErrorMessage error={error} onDismiss={onDismissError} />}
            </div>
          )}
        </div>
        <div className="relative">
          {isStreaming && (
            <div className="sticky bottom-full z-10 w-full">
              <LoadingIndicator />
            </div>
          )}

          {showScrollButton && <ScrollButton onClick={scrollToBottom} />}

          <div className="relative bg-surface-secondary pb-safe dark:bg-surface-dark-secondary">
            <div className="w-full py-2 lg:mx-auto lg:max-w-3xl">
              <Input
                message={inputMessage}
                setMessage={setInputMessage}
                onSubmit={onMessageSend}
                onAttach={onAttach}
                attachedFiles={attachedFiles}
                isLoading={isLoading || isStreaming}
                onStopStream={onStopStream}
                selectedModelId={selectedModelId}
                onModelChange={onModelChange}
                dropdownPosition="top"
                showAttachedFilesPreview={true}
                contextUsage={contextUsage}
                showTip={false}
              />
            </div>
          </div>
        </div>
      </div>
    </ChatProvider>
  );
});
