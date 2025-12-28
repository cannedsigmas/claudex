import { useRef, memo, useState, useCallback, useEffect, useMemo } from 'react';
import { FileUploadDialog } from '@/components/ui/FileUploadDialog';
import { DrawingModal } from '@/components/ui/DrawingModal';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useFileHandling } from '@/hooks/useFileHandling';
import { useInputFileOperations } from '@/hooks/useInputFileOperations';
import { DropIndicator } from './DropIndicator';
import { SendButton } from './SendButton';
import { Textarea } from './Textarea';
import { InputControls } from './InputControls';
import { InputAttachments } from './InputAttachments';
import { ReviewChipsBar } from './ReviewChipsBar';
import { InputSuggestionsPanel } from './InputSuggestionsPanel';
import { useChatStore, useReviewStore } from '@/store';
import { ContextUsageIndicator, ContextUsageInfo } from './ContextUsageIndicator';
import { useSlashCommandSuggestions } from '@/hooks/useSlashCommandSuggestions';
import { useEnhancePromptMutation } from '@/hooks/queries';
import { useMentionSuggestions } from '@/hooks/useMentionSuggestions';
import type { MentionItem, SlashCommand } from '@/types';
import { useChatContext } from '@/hooks/useChatContext';

export interface InputProps {
  message: string;
  setMessage: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onAttach?: (files: File[]) => void;
  attachedFiles?: File[] | null;
  isLoading: boolean;
  onStopStream?: () => void;
  placeholder?: string;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  dropdownPosition?: 'top' | 'bottom';
  showAttachedFilesPreview?: boolean;
  contextUsage?: ContextUsageInfo;
  showTip?: boolean;
  compact?: boolean;
}

export const Input = memo(function Input({
  message,
  setMessage,
  onSubmit,
  onAttach,
  attachedFiles,
  isLoading,
  onStopStream,
  placeholder = 'Message Claudex...',
  selectedModelId,
  onModelChange,
  dropdownPosition = 'top',
  showAttachedFilesPreview = true,
  contextUsage,
  showTip = true,
  compact = true,
}: InputProps) {
  const { fileStructure, customAgents, customSlashCommands, customPrompts } = useChatContext();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [cursorPosition, setCursorPosition] = useState(0);

  const currentChat = useChatStore((state) => state.currentChat);
  const reviews = useReviewStore((state) => state.reviews);
  const removeReview = useReviewStore((state) => state.removeReview);

  const chatReviews = useMemo(
    () => (currentChat ? reviews.filter((r) => r.chatId === currentChat.id) : []),
    [currentChat, reviews],
  );

  const { previewUrls } = useFileHandling({
    initialFiles: attachedFiles,
  });

  const {
    showFileUpload,
    setShowFileUpload,
    showDrawingModal,
    editingImageIndex,
    handleFileSelect,
    handleRemoveFile,
    handleDrawClick,
    handleDrawingSave,
    handleDroppedFiles,
    closeDrawingModal,
  } = useInputFileOperations({
    attachedFiles,
    onAttach,
  });

  const { isDragging, dragHandlers, resetDragState } = useDragAndDrop({
    onFilesDrop: handleDroppedFiles,
  });

  const focusTextarea = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      setTimeout(() => {
        textarea.focus();
        const length = text.length;
        textarea.setSelectionRange(length, length);
      }, 0);
    }
  }, []);

  const enhancePromptMutation = useEnhancePromptMutation({
    onSuccess: (enhancedPrompt) => {
      setMessage(enhancedPrompt);
      focusTextarea(enhancedPrompt);
    },
  });

  const hasMessage = message.trim().length > 0;
  const hasAttachments = (attachedFiles?.length ?? 0) > 0;
  const isEnhancing = enhancePromptMutation.isPending;

  const handleSlashCommandSelect = useCallback(
    (command: SlashCommand) => {
      setShowPreview(false);
      const newMessage = `${command.value} `;
      setMessage(newMessage);
      focusTextarea(newMessage);
    },
    [setMessage, focusTextarea],
  );

  const {
    filteredCommands: slashCommandSuggestions,
    highlightedIndex: highlightedSlashCommandIndex,
    selectCommand: selectSlashCommand,
    handleKeyDown: handleSlashCommandKeyDown,
  } = useSlashCommandSuggestions({
    message,
    onSelect: handleSlashCommandSelect,
    customSlashCommands,
  });

  const handleMentionSelect = useCallback(
    (item: MentionItem, mentionStartPos: number, mentionEndPos: number) => {
      const beforeMention = message.slice(0, mentionStartPos);
      const afterMention = message.slice(mentionEndPos);
      const newMessage = `${beforeMention}@${item.path} ${afterMention}`;
      const newCursorPos = mentionStartPos + item.path.length + 2;

      setMessage(newMessage);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          setCursorPosition(newCursorPos);
        }
      }, 0);
    },
    [message, setMessage],
  );

  const {
    filteredFiles,
    filteredAgents,
    filteredPrompts,
    highlightedIndex: highlightedMentionIndex,
    selectItem: selectMention,
    handleKeyDown: handleMentionKeyDown,
    isActive: isMentionActive,
  } = useMentionSuggestions({
    message,
    cursorPosition: cursorPosition,
    fileStructure,
    customAgents,
    customPrompts,
    onSelect: handleMentionSelect,
  });

  useEffect(() => {
    setShowPreview(showAttachedFilesPreview && hasAttachments);
  }, [hasAttachments, showAttachedFilesPreview]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!hasMessage) return;

      setShowPreview(false);
      onSubmit(event);
    },
    [hasMessage, onSubmit],
  );

  const submitOrStop = useCallback(() => {
    if (isLoading) {
      onStopStream?.();
      return;
    }

    if (!hasMessage) return;

    setShowPreview(false);

    const formElement = formRef.current;
    if (formElement && typeof formElement.requestSubmit === 'function') {
      formElement.requestSubmit();
      return;
    }

    const formEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    }) as unknown as React.FormEvent;
    onSubmit(formEvent);
  }, [hasMessage, isLoading, onStopStream, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<Element>) => {
      const handledByMentions = handleMentionKeyDown(event);
      if (handledByMentions) return;

      const handledBySlashCommands = handleSlashCommandKeyDown(event);
      if (handledBySlashCommands) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitOrStop();
      }
    },
    [handleMentionKeyDown, handleSlashCommandKeyDown, submitOrStop],
  );

  const handleSendClick = (event: React.MouseEvent) => {
    event.preventDefault();
    submitOrStop();
  };

  const handleEnhancePrompt = useCallback(() => {
    if (!hasMessage || isEnhancing) return;
    enhancePromptMutation.mutate({ prompt: message.trim(), modelId: selectedModelId });
  }, [hasMessage, isEnhancing, message, selectedModelId, enhancePromptMutation]);

  const shouldShowAttachedPreview = showAttachedFilesPreview && showPreview && hasAttachments;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative px-4 sm:px-6">
      <div
        {...dragHandlers}
        className={`relative rounded-2xl border bg-surface-tertiary transition-all duration-300 dark:bg-surface-dark-tertiary ${
          isDragging
            ? 'scale-[1.01] border-brand-400 bg-brand-50/50 dark:border-brand-500 dark:bg-brand-950/20'
            : 'border-border dark:border-border-dark'
        }`}
      >
        <DropIndicator visible={isDragging} fileType="any" message="Drop your files here" />

        <ReviewChipsBar reviews={chatReviews} onRemove={removeReview} />

        {shouldShowAttachedPreview && attachedFiles && (
          <InputAttachments
            files={attachedFiles}
            previewUrls={previewUrls}
            onRemoveFile={handleRemoveFile}
            onEditImage={handleDrawClick}
          />
        )}

        {contextUsage && (
          <div className="absolute right-3 top-3 z-10">
            <ContextUsageIndicator usage={contextUsage} />
          </div>
        )}

        <div className="relative px-3 pb-12 pt-1.5 sm:pb-9">
          <Textarea
            ref={textareaRef}
            message={message}
            setMessage={setMessage}
            placeholder={placeholder}
            isLoading={isLoading}
            onKeyDown={handleKeyDown}
            onCursorPositionChange={(pos) => setCursorPosition(pos)}
            compact={compact}
          />
          <InputSuggestionsPanel
            isMentionActive={isMentionActive}
            slashCommands={slashCommandSuggestions}
            highlightedSlashIndex={highlightedSlashCommandIndex}
            onSlashSelect={selectSlashCommand}
            mentionFiles={filteredFiles}
            mentionAgents={filteredAgents}
            mentionPrompts={filteredPrompts}
            highlightedMentionIndex={highlightedMentionIndex}
            onMentionSelect={selectMention}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 pb-safe">
          <div className="relative flex items-center justify-between">
            <InputControls
              selectedModelId={selectedModelId}
              onModelChange={onModelChange}
              onAttach={() => {
                resetDragState();
                setShowFileUpload(true);
              }}
              onEnhance={handleEnhancePrompt}
              dropdownPosition={dropdownPosition}
              isLoading={isLoading}
              isEnhancing={isEnhancing}
              hasMessage={hasMessage}
            />

            <div className="absolute bottom-2.5 right-3">
              <SendButton
                isLoading={isLoading}
                disabled={(!isLoading && !hasMessage) || isEnhancing}
                onClick={handleSendClick}
                type="button"
                hasMessage={hasMessage}
              />
            </div>
          </div>
        </div>
      </div>

      <FileUploadDialog
        isOpen={showFileUpload}
        onClose={() => setShowFileUpload(false)}
        onFileSelect={handleFileSelect}
      />

      {editingImageIndex !== null &&
        editingImageIndex < previewUrls.length &&
        previewUrls[editingImageIndex] && (
          <DrawingModal
            imageUrl={previewUrls[editingImageIndex]}
            isOpen={showDrawingModal}
            onClose={closeDrawingModal}
            onSave={handleDrawingSave}
          />
        )}

      {showTip && !hasAttachments && (
        <div className="mt-1 animate-fade-in text-center text-2xs text-text-quaternary dark:text-text-dark-tertiary">
          <span className="font-medium">Tip:</span> Drag and drop images, pdfs and xlsx files into
          the input area, type `/` for slash commands, or `@` to mention files, agents, and prompts
        </div>
      )}
    </form>
  );
});
