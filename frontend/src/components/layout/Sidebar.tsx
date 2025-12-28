import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useInView } from 'react-intersection-observer';
import type { FetchNextPageOptions } from '@tanstack/react-query';
import type { Chat } from '@/types';
import { Button, ConfirmDialog, Input, RenameModal, Spinner } from '@/components/ui';
import { useDeleteChatMutation, useUpdateChatMutation, usePinChatMutation } from '@/hooks/queries';
import { cn } from '@/utils/cn';
import { useUIStore, useStreamStore } from '@/store';
import { useIsMobile } from '@/hooks';
import { SidebarChatItem } from './SidebarChatItem';
import { ChatDropdown } from './ChatDropdown';
import { DROPDOWN_WIDTH, DROPDOWN_HEIGHT, DROPDOWN_MARGIN } from '@/config/constants';

function calculateDropdownPosition(buttonRect: DOMRect): { top: number; left: number } {
  const isMobile = window.innerWidth < 640;
  const spaceBelow = window.innerHeight - buttonRect.bottom;
  const spaceRight = window.innerWidth - buttonRect.right;

  let top: number;
  let left: number;

  if (isMobile) {
    top =
      spaceBelow >= DROPDOWN_HEIGHT + DROPDOWN_MARGIN
        ? buttonRect.bottom + 4
        : buttonRect.top - DROPDOWN_HEIGHT - 4;
    left = buttonRect.right - DROPDOWN_WIDTH;
  } else {
    top =
      spaceBelow >= DROPDOWN_HEIGHT + DROPDOWN_MARGIN
        ? buttonRect.top
        : buttonRect.top - DROPDOWN_HEIGHT + buttonRect.height;
    left =
      spaceRight >= DROPDOWN_WIDTH + DROPDOWN_MARGIN
        ? buttonRect.right + 4
        : buttonRect.left - DROPDOWN_WIDTH - 4;
  }

  top = Math.max(
    DROPDOWN_MARGIN,
    Math.min(top, window.innerHeight - DROPDOWN_HEIGHT - DROPDOWN_MARGIN),
  );
  left = Math.max(
    DROPDOWN_MARGIN,
    Math.min(left, window.innerWidth - DROPDOWN_WIDTH - DROPDOWN_MARGIN),
  );

  return { top, left };
}

export interface SidebarProps {
  chats: Chat[];
  selectedChatId: string | null;
  onChatSelect: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  hasNextPage?: boolean;
  fetchNextPage?: (options?: FetchNextPageOptions) => unknown;
  isFetchingNextPage?: boolean;
  hasActivityBar?: boolean;
}

export function Sidebar({
  chats,
  selectedChatId,
  onChatSelect,
  onDeleteChat,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  hasActivityBar = false,
}: SidebarProps) {
  const navigate = useNavigate();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const isMobile = useIsMobile();
  const activeStreamMetadata = useStreamStore((state) => state.activeStreamMetadata);
  const streamingChatIds = useMemo(
    () => activeStreamMetadata.map((meta) => meta.chatId),
    [activeStreamMetadata],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [chatToRename, setChatToRename] = useState<Chat | null>(null);
  const [dropdown, setDropdown] = useState<{
    chatId: string;
    position: { top: number; left: number };
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const deleteChat = useDeleteChatMutation();
  const updateChat = useUpdateChatMutation();
  const pinChat = usePinChatMutation();

  const dropdownChat = useMemo(() => {
    if (!dropdown) return null;
    return chats.find((c) => c.id === dropdown.chatId) || null;
  }, [dropdown, chats]);

  const { ref: loadMoreRef, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage?.();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { pinnedChats, unpinnedChats } = useMemo(() => {
    const filtered = chats.filter((chat) =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    return {
      pinnedChats: filtered.filter((chat) => !!chat.pinned_at),
      unpinnedChats: filtered.filter((chat) => !chat.pinned_at),
    };
  }, [chats, searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const handleScroll = () => {
      if (dropdown) {
        setDropdown(null);
      }
    };

    scrollContainer?.addEventListener('scroll', handleScroll);
    return () => scrollContainer?.removeEventListener('scroll', handleScroll);
  }, [dropdown]);

  const handleChatSelect = useCallback(
    (chatId: string) => {
      onChatSelect(chatId);
      setHoveredChatId(null);
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [onChatSelect, isMobile, setSidebarOpen],
  );

  const handleDeleteChat = useCallback((chatId: string) => {
    setChatToDelete(chatId);
    setDropdown(null);
  }, []);

  const handleMouseEnter = useCallback((chatId: string) => {
    setHoveredChatId(chatId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredChatId(null);
  }, []);

  const confirmDeleteChat = async () => {
    if (chatToDelete) {
      try {
        await deleteChat.mutateAsync(chatToDelete);
        toast.success('Chat deleted successfully');

        if (chatToDelete === selectedChatId) {
          navigate('/');
        }

        if (onDeleteChat) {
          onDeleteChat(chatToDelete);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete chat');
      } finally {
        setChatToDelete(null);
      }
    }
  };

  const handleNewChat = () => {
    navigate('/');
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDropdownClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, chatId: string) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();

      setHoveredChatId(null);

      setDropdown((prev) => {
        if (prev?.chatId === chatId) {
          return null;
        }

        const position = calculateDropdownPosition(rect);
        return { chatId, position };
      });
    },
    [],
  );

  const handleRenameClick = (chat: Chat) => {
    setChatToRename(chat);
    setDropdown(null);
  };

  const handleSaveRename = async (newTitle: string) => {
    if (!chatToRename) return;

    try {
      await updateChat.mutateAsync({
        chatId: chatToRename.id,
        updateData: { title: newTitle },
      });
      toast.success('Chat renamed successfully');
      setChatToRename(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename chat');
      throw error;
    }
  };

  const handleTogglePin = useCallback(
    async (chat: Chat) => {
      setDropdown(null);
      const isPinned = !!chat.pinned_at;
      try {
        await pinChat.mutateAsync({ chatId: chat.id, pinned: !isPinned });
        toast.success(isPinned ? 'Chat unpinned' : 'Chat pinned');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update pin status');
      }
    },
    [pinChat],
  );

  return (
    <>
      <aside
        className={cn(
          'absolute top-0 h-full w-64',
          'bg-surface dark:bg-surface-dark',
          'z-40 flex flex-col transition-[left] duration-500 ease-in-out',
          sidebarOpen ? (hasActivityBar ? 'left-12' : 'left-0') : '-left-64',
        )}
      >
        <div className="p-3">
          <Button
            onClick={handleNewChat}
            variant="unstyled"
            className={cn(
              'w-full px-3 py-1.5',
              'bg-surface-secondary dark:bg-surface-dark-secondary',
              'hover:bg-surface-hover dark:hover:bg-surface-dark-hover',
              'border border-border dark:border-border-dark',
              'text-text-primary dark:text-text-dark-primary',
              'rounded-lg transition-colors duration-200',
              'flex items-center justify-center gap-2 text-sm font-medium',
            )}
          >
            New Agent
          </Button>
        </div>

        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary dark:text-text-dark-tertiary" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              variant="unstyled"
              className={cn(
                'w-full py-1.5 pl-8 pr-3',
                'bg-surface-secondary dark:bg-surface-dark-secondary',
                'border border-border dark:border-border-dark',
                'rounded-lg text-text-primary dark:text-text-dark-primary',
                'placeholder-text-tertiary dark:placeholder-text-dark-tertiary',
                'focus:outline-none focus:ring-1 focus:ring-border-secondary dark:focus:ring-border-dark-secondary',
                'text-sm',
              )}
            />
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2">
          {pinnedChats.length === 0 && unpinnedChats.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary dark:text-text-dark-tertiary">
              {searchQuery ? 'No matching chats' : 'No chats yet'}
            </p>
          ) : (
            <div className="space-y-1">
              {pinnedChats.length > 0 && (
                <>
                  <div className="px-2 py-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary dark:text-text-dark-tertiary">
                      Pinned
                    </span>
                  </div>
                  {pinnedChats.map((chat) => (
                    <SidebarChatItem
                      key={chat.id}
                      chat={chat}
                      isSelected={chat.id === selectedChatId}
                      isHovered={hoveredChatId === chat.id}
                      isDropdownOpen={dropdown?.chatId === chat.id}
                      isChatStreaming={streamingChatIds.includes(chat.id)}
                      onSelect={handleChatSelect}
                      onDropdownClick={handleDropdownClick}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                    />
                  ))}
                </>
              )}

              {unpinnedChats.length > 0 && (
                <>
                  {pinnedChats.length > 0 && (
                    <div className="mt-2 px-2 py-1.5">
                      <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary dark:text-text-dark-tertiary">
                        Recent
                      </span>
                    </div>
                  )}
                  {unpinnedChats.map((chat) => (
                    <SidebarChatItem
                      key={chat.id}
                      chat={chat}
                      isSelected={chat.id === selectedChatId}
                      isHovered={hoveredChatId === chat.id}
                      isDropdownOpen={dropdown?.chatId === chat.id}
                      isChatStreaming={streamingChatIds.includes(chat.id)}
                      onSelect={handleChatSelect}
                      onDropdownClick={handleDropdownClick}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                    />
                  ))}
                </>
              )}

              {hasNextPage && (
                <div ref={loadMoreRef} className="py-2 text-center">
                  {isFetchingNextPage ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-text-tertiary dark:text-text-dark-tertiary">
                      <Spinner size="xs" />
                      Loading more...
                    </div>
                  ) : (
                    <div className="h-4" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {dropdown && dropdownChat && (
        <ChatDropdown
          ref={dropdownRef}
          chat={dropdownChat}
          position={dropdown.position}
          onRename={handleRenameClick}
          onDelete={handleDeleteChat}
          onTogglePin={handleTogglePin}
        />
      )}

      <ConfirmDialog
        isOpen={!!chatToDelete}
        onClose={() => setChatToDelete(null)}
        onConfirm={confirmDeleteChat}
        title="Delete Chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />

      <RenameModal
        isOpen={!!chatToRename}
        onClose={() => setChatToRename(null)}
        onSave={handleSaveRename}
        currentTitle={chatToRename?.title || ''}
        isLoading={updateChat.isPending}
      />
    </>
  );
}
