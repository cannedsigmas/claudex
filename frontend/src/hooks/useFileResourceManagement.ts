import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';
import type { UserSettings } from '@/types';
import { queryKeys } from './queries/queryKeys';

type PersistSettingsFn = (
  updater: (previous: UserSettings) => UserSettings,
  options?: { successMessage?: string; errorMessage?: string },
) => Promise<void>;

type SettingsArrayKey = 'custom_agents' | 'custom_skills' | 'custom_slash_commands';

interface UseFileResourceOptions<T> {
  settingsKey: SettingsArrayKey;
  itemName: string;
  maxItems: number;
  uploadFn: (file: File) => Promise<T>;
  deleteFn: (name: string) => Promise<void>;
  updateFn?: (name: string, content: string) => Promise<T>;
}

export function useFileResourceManagement<T extends { name: string; enabled?: boolean }>(
  localSettings: UserSettings,
  persistSettings: PersistSettingsFn,
  setLocalSettings: Dispatch<SetStateAction<UserSettings>>,
  options: UseFileResourceOptions<T>,
) {
  const { settingsKey, itemName, maxItems, uploadFn, deleteFn, updateFn } = options;
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const getItems = useCallback((): T[] => {
    return (localSettings[settingsKey] as T[] | null) || [];
  }, [localSettings, settingsKey]);

  const handleAdd = useCallback(() => {
    setUploadError(null);
    setIsDialogOpen(true);
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      const currentItems = getItems();
      if (currentItems.length >= maxItems) {
        setUploadError(`Maximum ${maxItems} ${itemName}s allowed`);
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const data = await uploadFn(file);
        setLocalSettings((prev) => ({
          ...prev,
          [settingsKey]: [...((prev[settingsKey] as T[] | null) || []), data],
        }));
        queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
        queryClient.invalidateQueries({ queryKey: [queryKeys.settings] });
        toast.success(`${itemName} uploaded successfully`);
        setIsDialogOpen(false);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [getItems, maxItems, itemName, uploadFn, setLocalSettings, settingsKey],
  );

  const handleDelete = useCallback(
    async (index: number) => {
      const items = getItems();
      const item = items[index];
      if (!item) return;

      try {
        await deleteFn(item.name);
        setLocalSettings((prev) => {
          const arr = [...((prev[settingsKey] as T[] | null) || [])];
          arr.splice(index, 1);
          return {
            ...prev,
            [settingsKey]: arr.length > 0 ? arr : null,
          };
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
        queryClient.invalidateQueries({ queryKey: [queryKeys.settings] });
        toast.success(`Deleted ${item.name}`);
      } catch (error) {
        logger.error(`Failed to delete ${itemName}`, 'useFileResourceManagement', error);
        toast.error(`Failed to delete ${itemName}`);
      }
    },
    [getItems, deleteFn, setLocalSettings, settingsKey, itemName, queryClient],
  );

  const handleToggle = useCallback(
    (index: number, enabled: boolean) => {
      persistSettings(
        (prev) => {
          const arr = [...((prev[settingsKey] as T[] | null) || [])];
          if (arr[index]) {
            arr[index] = { ...arr[index], enabled };
          }
          return { ...prev, [settingsKey]: arr };
        },
        { errorMessage: `Failed to update ${itemName} state` },
      ).catch((error) => {
        logger.error(`Failed to toggle ${itemName}`, 'useFileResourceManagement', error);
      });
    },
    [persistSettings, settingsKey, itemName],
  );

  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const handleEdit = useCallback(
    (index: number) => {
      if (!updateFn) return;
      setEditError(null);
      setEditingIndex(index);
      setIsEditDialogOpen(true);
    },
    [updateFn],
  );

  const handleSaveEdit = useCallback(
    async (content: string) => {
      if (!updateFn || editingIndex === null) return;
      const items = getItems();
      const item = items[editingIndex];
      if (!item) return;

      setIsSavingEdit(true);
      setEditError(null);

      try {
        const updated = await updateFn(item.name, content);
        setLocalSettings((prev) => {
          const arr = [...((prev[settingsKey] as T[] | null) || [])];
          arr[editingIndex] = updated;
          return { ...prev, [settingsKey]: arr };
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
        queryClient.invalidateQueries({ queryKey: [queryKeys.settings] });
        toast.success(`${itemName} updated successfully`);
        setIsEditDialogOpen(false);
        setEditingIndex(null);
      } catch (error) {
        setEditError(error instanceof Error ? error.message : 'Update failed');
      } finally {
        setIsSavingEdit(false);
      }
    },
    [updateFn, editingIndex, getItems, setLocalSettings, settingsKey, itemName],
  );

  const handleEditDialogClose = useCallback(() => {
    setIsEditDialogOpen(false);
    setEditingIndex(null);
    setEditError(null);
  }, []);

  const editingItem = editingIndex !== null ? getItems()[editingIndex] : null;

  return {
    isDialogOpen,
    isUploading,
    uploadError,
    handleAdd,
    handleUpload,
    handleDialogClose,
    handleDelete,
    handleToggle,
    isEditDialogOpen,
    editingItem,
    isSavingEdit,
    editError,
    handleEdit,
    handleSaveEdit,
    handleEditDialogClose,
  };
}
