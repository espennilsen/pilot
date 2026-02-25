/**
 * useImageAttachments — Hook for managing image file attachments in MessageInput.
 *
 * Handles drag & drop, clipboard paste, file picker, saving images to disk
 * via IPC, and tracking attachment state with blob URL previews.
 */

import { useState, useRef, DragEvent, ClipboardEvent } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import type { ImageAttachment } from './message-input-helpers';
import { SUPPORTED_IMAGE_TYPES, isSupportedImage } from './message-input-helpers';

export function useImageAttachments(activeTabId: string | null) {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Save a File to disk via IPC and return an ImageAttachment */
  const saveImageToDisk = async (file: File): Promise<ImageAttachment> => {
    const projectPath = useTabStore.getState().tabs.find(t => t.id === activeTabId)?.projectPath;
    if (!projectPath) throw new Error('No project open');

    // Electron File objects from drag & drop have a .path property
    const electronPath = (file as any).path as string | undefined;
    if (electronPath) {
      return { path: electronPath, name: file.name, previewUrl: URL.createObjectURL(file) };
    }

    // For clipboard paste / no path: read as base64 and save via IPC
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1] || '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const savedPath = await invoke(IPC.ATTACHMENT_SAVE, projectPath, file.name || 'paste.png', base64) as string;
    return { path: savedPath, name: file.name || 'paste.png', previewUrl: URL.createObjectURL(file) };
  };

  /** Process dropped/pasted/picked image files: save to disk, add to state */
  const addImageFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const attachment = await saveImageToDisk(file);
        setImages(prev => [...prev, attachment]);
      } catch (err) {
        console.error('[useImageAttachments] Failed to save image:', err);
      }
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(isSupportedImage);
    if (files.length > 0) {
      addImageFiles(files);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => SUPPORTED_IMAGE_TYPES.has(item.type));
    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null);
      addImageFiles(files);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(isSupportedImage);
    if (files.length > 0) {
      addImageFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  /** Revoke all blob URLs and clear images */
  const clearImages = () => {
    for (const img of images) {
      URL.revokeObjectURL(img.previewUrl);
    }
    setImages([]);
  };

  return {
    images,
    setImages,
    isDragging,
    setIsDragging,
    fileInputRef,
    addImageFiles,
    handleDrop,
    handlePaste,
    handleFileClick,
    handleFileChange,
    removeImage,
    clearImages,
  };
}
