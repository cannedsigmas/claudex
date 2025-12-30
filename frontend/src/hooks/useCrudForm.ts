import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';
import { queryKeys } from './queries/queryKeys';

interface UseCrudFormOptions<S, T, K extends keyof S> {
  createDefault: () => T;
  validateForm: (form: T, editingIndex: number | null) => string | null;
  getArrayKey: K;
  itemName: string;
  createFn?: (data: T) => Promise<T>;
  updateFn?: (name: string, data: Partial<T>) => Promise<T>;
  deleteFn?: (name: string) => Promise<void>;
  toggleFn?: (name: string, enabled: boolean) => Promise<T>;
}

type PersistFn<S> = (
  updater: (prev: S) => S,
  options?: { successMessage?: string; errorMessage?: string },
) => Promise<void>;

export const useCrudForm = <S, T, K extends keyof S>(
  settings: S,
  persistSettings: PersistFn<S>,
  setLocalSettings: Dispatch<SetStateAction<S>>,
  options: UseCrudFormOptions<S, T, K>,
) => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<T>(options.createDefault());
  const [formError, setFormError] = useState<string | null>(null);

  const getItems = useCallback(() => {
    return (settings[options.getArrayKey] as T[] | null | undefined) || [];
  }, [settings, options.getArrayKey]);

  const resetForm = useCallback(() => {
    setForm(options.createDefault());
    setEditingIndex(null);
    setFormError(null);
  }, [options]);

  const handleAdd = useCallback(() => {
    resetForm();
    setIsDialogOpen(true);
  }, [resetForm]);

  const handleEdit = useCallback(
    (index: number) => {
      const items = getItems();
      const item = items[index];
      if (item) {
        setForm({ ...item });
        setEditingIndex(index);
        setFormError(null);
        setIsDialogOpen(true);
      }
    },
    [getItems],
  );

  const handleDelete = useCallback(
    async (index: number) => {
      const items = getItems();
      const item = items[index];
      const targetName =
        item && typeof item === 'object' && 'name' in item
          ? (item as { name: string }).name
          : undefined;

      try {
        if (options.deleteFn && targetName) {
          await options.deleteFn(targetName);
          setLocalSettings((prev) => {
            const arr = [...((prev[options.getArrayKey] as T[] | null | undefined) || [])];
            arr.splice(index, 1);
            return {
              ...prev,
              [options.getArrayKey]: arr.length > 0 ? arr : null,
            } as S;
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
          toast.success(`Deleted ${targetName}`);
        } else {
          await persistSettings(
            (prev: S) => {
              const arr = [...((prev[options.getArrayKey] as T[] | null | undefined) || [])];
              arr.splice(index, 1);
              return {
                ...prev,
                [options.getArrayKey]: arr.length > 0 ? arr : null,
              } as S;
            },
            {
              successMessage: targetName ? `Deleted ${targetName}` : `${options.itemName} deleted`,
              errorMessage: `Failed to delete ${options.itemName}`,
            },
          );
          queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.installed });
        }
      } catch (error) {
        logger.error(`Failed to delete ${options.itemName}`, 'useCrudForm', error);
        toast.error(`Failed to delete ${options.itemName}`);
      }
    },
    [getItems, persistSettings, setLocalSettings, options, queryClient],
  );

  const handleToggleEnabled = useCallback(
    async (index: number, enabled: boolean) => {
      const items = getItems();
      const item = items[index];
      const targetName =
        item && typeof item === 'object' && 'name' in item
          ? (item as { name: string }).name
          : undefined;

      try {
        if (options.toggleFn && targetName) {
          const updatedItem = await options.toggleFn(targetName, enabled);
          setLocalSettings((prev) => {
            const arr = [...((prev[options.getArrayKey] as T[] | null | undefined) || [])];
            if (arr[index]) {
              arr[index] = updatedItem;
            }
            return { ...prev, [options.getArrayKey]: arr } as S;
          });
        } else {
          await persistSettings(
            (prev: S) => {
              const arr = [...((prev[options.getArrayKey] as T[] | null | undefined) || [])];
              if (arr[index]) {
                arr[index] = { ...arr[index], enabled };
              }
              return { ...prev, [options.getArrayKey]: arr } as S;
            },
            { errorMessage: `Failed to update ${options.itemName} state` },
          );
        }
      } catch (error) {
        logger.error(`Failed to toggle ${options.itemName}`, 'useCrudForm', error);
        toast.error(`Failed to update ${options.itemName} state`);
      }
    },
    [getItems, persistSettings, setLocalSettings, options],
  );

  const handleFormChange = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
    resetForm();
  }, [resetForm]);

  const handleSave = useCallback(async () => {
    const validationError = options.validateForm(form, editingIndex);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      const items = getItems();
      const existingItem = editingIndex !== null ? items[editingIndex] : null;
      const existingName =
        existingItem && typeof existingItem === 'object' && 'name' in existingItem
          ? (existingItem as { name: string }).name
          : undefined;

      const isUpdate = editingIndex !== null;
      const hasApiFn = isUpdate ? !!options.updateFn : !!options.createFn;

      let savedItem: T = form;
      if (isUpdate && options.updateFn && existingName) {
        savedItem = await options.updateFn(existingName, form);
      } else if (!isUpdate && options.createFn) {
        savedItem = await options.createFn(form);
      }

      if (hasApiFn) {
        setLocalSettings((prev) => {
          const nextItems = [...((prev[options.getArrayKey] as T[] | null | undefined) || [])];
          if (editingIndex !== null) {
            nextItems[editingIndex] = savedItem;
          } else {
            nextItems.push(savedItem);
          }
          return { ...prev, [options.getArrayKey]: nextItems } as S;
        });
        toast.success(isUpdate ? `${options.itemName} updated` : `${options.itemName} added`);
      } else {
        await persistSettings(
          (prev: S) => {
            const nextItems = [...((prev[options.getArrayKey] as T[] | null | undefined) || [])];
            if (editingIndex !== null) {
              nextItems[editingIndex] = savedItem;
            } else {
              nextItems.push(savedItem);
            }
            return { ...prev, [options.getArrayKey]: nextItems } as S;
          },
          {
            successMessage: isUpdate ? `${options.itemName} updated` : `${options.itemName} added`,
            errorMessage: `Failed to save ${options.itemName}`,
          },
        );
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  }, [form, editingIndex, getItems, persistSettings, setLocalSettings, resetForm, options]);

  return {
    isDialogOpen,
    editingIndex,
    form,
    formError,
    handleAdd,
    handleEdit,
    handleDelete,
    handleToggleEnabled,
    handleFormChange,
    handleDialogClose,
    handleSave,
  };
};
