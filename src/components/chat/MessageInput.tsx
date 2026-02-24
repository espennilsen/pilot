import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent, ClipboardEvent } from 'react';
import { Plus, ArrowUp, Square, ChevronDown, Zap, Clock } from 'lucide-react';
import { useChatStore } from '../../stores/chat-store';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import SlashCommandMenu, { type SlashCommand } from './SlashCommandMenu';
import FileMentionMenu, { type FileMention } from './FileMentionMenu';
import { PromptLibraryButton } from '../prompts/PromptLibraryButton';
import PromptPicker from '../prompts/PromptPicker';
import { PromptFillDialog } from '../prompts/PromptFillDialog';
import PromptEditor from '../prompts/PromptEditor';
import { ModelPicker } from './ModelPicker';
import type { ImageAttachment } from './message-input-helpers';
import { SUPPORTED_IMAGE_TYPES, isSupportedImage } from './message-input-helpers';
import type { PromptTemplate } from '../../../shared/types';

interface MessageInputProps {
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onFollowUp: (text: string) => void;
  onAbort: () => void;
  onSelectModel: (provider: string, modelId: string) => void;
  onCycleThinking: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export default function MessageInput({ onSend, onSteer, onFollowUp, onAbort, onSelectModel, onCycleThinking, isStreaming, disabled }: MessageInputProps) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  const activeTabId = useTabStore(s => s.activeTabId);
  const model = useChatStore(s => activeTabId ? s.modelByTab[activeTabId] : undefined);
  const modelInfo = useChatStore(s => activeTabId ? s.modelInfoByTab[activeTabId] : undefined);
  const queued = useChatStore(s => activeTabId ? s.queuedByTab[activeTabId] : undefined);
  const thinkingLevel = useChatStore(s => activeTabId ? (s.thinkingByTab[activeTabId] || 'off') : 'off');

  // Prompt picker state
  const [promptPickerOpen, setPromptPickerOpen] = useState(false);
  const [promptFillTarget, setPromptFillTarget] = useState<{ prompt: PromptTemplate; initialValue?: string } | null>(null);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);

  // Memory command detection
  const isMemoryCommand = input.startsWith('#') && !input.startsWith('##');
  const isSlashMemory = input.trim().toLowerCase() === '/memory';

  // Slash command menu state
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const slashCommandsLoadingRef = useRef(false);

  // File mention (@) state
  const [mentionFiles, setMentionFiles] = useState<FileMention[]>([]);
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FileMention[]>([]);
  const mentionSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect if we should show slash command menu:
  // Input starts with '/' on the first line, no space yet (or filtering)
  const slashMatch = input.match(/^\/(\S*)$/);
  const slashFilter = slashMatch ? slashMatch[1] : '';
  const isSlashMode = slashMatch !== null && !isStreaming;

  // Load slash commands every time the slash menu opens.
  // The IPC call reads from in-memory data so it's fast.
  // Re-fetch on every open ensures prompt library changes, newly
  // loaded sessions, and extension commands are always up-to-date.
  useEffect(() => {
    if (isSlashMode && activeTabId && !slashCommandsLoadingRef.current) {
      slashCommandsLoadingRef.current = true;
      invoke(IPC.AGENT_GET_SLASH_COMMANDS, activeTabId).then((cmds: any) => {
        if (Array.isArray(cmds)) {
          setSlashCommands(cmds);
        }
      }).catch(() => {}).finally(() => {
        slashCommandsLoadingRef.current = false;
      });
    }
    if (isSlashMode) {
      setSlashMenuVisible(true);
      setSlashSelectedIndex(0);
    } else {
      setSlashMenuVisible(false);
    }
  }, [isSlashMode, activeTabId]);

  /**
   * Detect @mention trigger: find the word starting with @ at or before the cursor.
   * Returns the query (text after @) and the start/end offsets, or null if not in @-mode.
   */
  const getMentionContext = useCallback((): { query: string; start: number; end: number } | null => {
    const ta = textareaRef.current;
    if (!ta) return null;
    const cursorPos = ta.selectionStart;
    const text = ta.value;

    // Walk backwards from cursor to find the @ that starts this word
    let i = cursorPos - 1;
    while (i >= 0 && !/\s/.test(text[i])) {
      i--;
    }
    const wordStart = i + 1;
    const word = text.substring(wordStart, cursorPos);

    if (word.startsWith('@') && word.length >= 1) {
      return { query: word.substring(1), start: wordStart, end: cursorPos };
    }
    return null;
  }, []);

  // Search files when @mention query changes
  const triggerMentionSearch = useCallback((query: string) => {
    if (mentionSearchTimer.current) clearTimeout(mentionSearchTimer.current);
    setMentionQuery(query);
    if (!query) {
      setMentionFiles([]);
      setMentionVisible(true);
      setMentionLoading(false);
      return;
    }
    setMentionLoading(true);
    setMentionVisible(true);
    mentionSearchTimer.current = setTimeout(() => {
      invoke(IPC.PROJECT_FILE_SEARCH, query, true).then((results: any) => {
        if (Array.isArray(results)) {
          setMentionFiles(results as FileMention[]);
        }
        setMentionLoading(false);
      }).catch(() => {
        setMentionFiles([]);
        setMentionLoading(false);
      });
    }, 80); // 80ms debounce
  }, []);

  // Handle @mention file selection
  const handleMentionSelect = useCallback((file: FileMention) => {
    const ctx = getMentionContext();
    if (!ctx) return;

    // Replace @query with @relativePath
    const before = input.substring(0, ctx.start);
    const after = input.substring(ctx.end);
    const mention = `@${file.relativePath} `;
    const newInput = before + mention + after;
    setInput(newInput);

    // Track the attached file (avoid duplicates)
    setAttachedFiles(prev =>
      prev.some(f => f.path === file.path) ? prev : [...prev, file]
    );

    setMentionVisible(false);
    setMentionFiles([]);
    setMentionSelectedIndex(0);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = ctx.start + mention.length;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
      }
    });
  }, [input, getMentionContext]);

  // Compute filtered list for index clamping
  const filteredSlashCommands = slashCommands.filter(cmd => {
    if (!slashFilter) return true;
    const f = slashFilter.toLowerCase();
    return cmd.name.toLowerCase().includes(f) || cmd.description.toLowerCase().includes(f);
  });

  // Reset selected index when filter changes
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashFilter]);

  // Clamp selected index to available items
  const clampedSlashIndex = Math.min(slashSelectedIndex, Math.max(0, filteredSlashCommands.length - 1));

  const handleSlashSelect = useCallback(async (cmd: SlashCommand) => {
    setSlashMenuVisible(false);

    // If it's a prompt command, open the fill dialog
    if (cmd.source === 'prompt') {
      try {
        const prompt = await invoke(IPC.PROMPTS_GET_BY_COMMAND, cmd.name) as PromptTemplate | null;
        if (prompt) {
          setInput('');
          if (prompt.variables.length === 0) {
            setInput(prompt.content);
          } else {
            setPromptFillTarget({ prompt });
          }
          textareaRef.current?.focus();
          return;
        }
      } catch { /* fall through to default behavior */ }
    }

    // Default: insert the command with a trailing space for args
    const commandText = `/${cmd.name} `;
    setInput(commandText);
    textareaRef.current?.focus();
  }, []);

  // Listen for global Cmd+/ keybinding
  useEffect(() => {
    const handler = () => setPromptPickerOpen(prev => !prev);
    window.addEventListener('pilot:toggle-prompt-picker', handler);
    return () => window.removeEventListener('pilot:toggle-prompt-picker', handler);
  }, []);

  // Prompt picker handlers
  const handlePromptSelect = useCallback((prompt: PromptTemplate) => {
    setPromptPickerOpen(false);
    if (prompt.variables.length === 0) {
      // No variables — insert directly
      setInput(prompt.content);
      textareaRef.current?.focus();
    } else {
      // Has variables — open fill dialog
      setPromptFillTarget({ prompt });
    }
  }, []);

  const handlePromptFilled = useCallback((filledContent: string) => {
    setInput(filledContent);
    setPromptFillTarget(null);
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

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

  const handleSend = async () => {
    if ((!input.trim() && images.length === 0) || disabled) return;

    try {
    // Check if it's a prompt slash command (e.g., /review check auth for XSS)
    if (!isStreaming && input.startsWith('/')) {
      const slashMatch = input.match(/^\/([a-z][a-z0-9-]*)\s*(.*)?$/s);
      if (slashMatch) {
        const [, cmdName, inlineText] = slashMatch;
        try {
          const prompt = await invoke(IPC.PROMPTS_GET_BY_COMMAND, cmdName) as PromptTemplate | null;
          if (prompt) {
            setInput('');
            if (prompt.variables.length === 0) {
              onSend(prompt.content);
              setImages([]);
              resetHistory();
            } else {
              setPromptFillTarget({
                prompt,
                initialValue: inlineText?.trim() || undefined,
              });
            }
            return;
          }
        } catch { /* Not a prompt command, fall through */ }
      }
    }

    // Build the final message with file context and image paths prepended
    let finalText = input.trim();
    if (attachedFiles.length > 0 && !isStreaming) {
      const fileList = attachedFiles.map(f => f.relativePath).join(', ');
      finalText = `[Attached files: ${fileList}]\n\nRead the attached files first, then respond to:\n\n${finalText}`;
    }

    // Prepend image attachment paths so the agent reads them via the read tool
    if (images.length > 0 && !isStreaming) {
      const imagePaths = images.map(img => img.path).join('\n');
      const imageInstruction = images.length === 1
        ? `The user attached an image to this message. Use the read tool to view it before responding:\n${imagePaths}`
        : `The user attached ${images.length} images to this message. Use the read tool to view each one before responding:\n${imagePaths}`;
      finalText = `${imageInstruction}\n\n${finalText}`;
    }

    if (isStreaming) {
      onSteer(finalText);
    } else {
      onSend(finalText);
    }

    // Revoke blob URLs to prevent memory leaks
    for (const img of images) {
      URL.revokeObjectURL(img.previewUrl);
    }

    setInput('');
    setImages([]);
    setAttachedFiles([]);
    resetHistory();
    } catch (err) {
      console.error('[handleSend] error:', err);
    }
  };

  const handleFollowUp = () => {
    if (!input.trim() || disabled || !isStreaming) return;
    onFollowUp(input.trim());
    setInput('');
    setImages([]);
    resetHistory();
  };

  // Build user message history for up/down arrow navigation
  const messages = useChatStore(s => activeTabId ? s.messagesByTab[activeTabId] : undefined);
  const userMessages = (messages || []).filter(m => m.role === 'user').map(m => m.content);
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = not browsing history
  const savedDraftRef = useRef(''); // stash current input when entering history
  const historyLockedRef = useRef(false); // locked after user edits a history entry

  const resetHistory = () => {
    setHistoryIndex(-1);
    historyLockedRef.current = false;
  };

  // Detect user edits: if they type while browsing history, lock it
  const handleInputChange = (value: string) => {
    if (historyIndex > -1) {
      const historyValue = userMessages[userMessages.length - 1 - historyIndex];
      if (value !== historyValue) {
        historyLockedRef.current = true;
      }
    }
    setInput(value);

    // Check for @mention trigger after state update
    requestAnimationFrame(() => {
      const ctx = getMentionContext();
      if (ctx !== null) {
        triggerMentionSearch(ctx.query);
        setMentionSelectedIndex(0);
      } else {
        setMentionVisible(false);
      }
    });
  };

  // Check if cursor is on the first line of the textarea
  const isOnFirstLine = () => {
    const ta = textareaRef.current;
    if (!ta) return false;
    const textBeforeCursor = ta.value.substring(0, ta.selectionStart);
    return !textBeforeCursor.includes('\n');
  };

  // Check if cursor is on the last line of the textarea
  const isOnLastLine = () => {
    const ta = textareaRef.current;
    if (!ta) return false;
    const textAfterCursor = ta.value.substring(ta.selectionEnd);
    return !textAfterCursor.includes('\n');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // --- File mention menu keyboard navigation ---
    if (mentionVisible && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex(i => Math.min(i + 1, mentionFiles.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const file = mentionFiles[mentionSelectedIndex];
        if (file) handleMentionSelect(file);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionVisible(false);
        return;
      }
    }

    // --- Slash command menu keyboard navigation ---
    if (slashMenuVisible && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(i => Math.min(i + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const cmd = filteredSlashCommands[clampedSlashIndex];
        if (cmd) handleSlashSelect(cmd);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuVisible(false);
        return;
      }
    }

    // Escape = stop agent when streaming
    if (e.key === 'Escape' && isStreaming && !slashMenuVisible && !mentionVisible) {
      e.preventDefault();
      onAbort();
      return;
    }

    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      onCycleThinking();
      return;
    }

    // Up arrow: browse message history (cursor on first line, not locked)
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.altKey) {
      if (!historyLockedRef.current && isOnFirstLine() && userMessages.length > 0) {
        e.preventDefault();
        if (historyIndex === -1) {
          savedDraftRef.current = input;
        }
        const newIndex = Math.min(historyIndex + 1, userMessages.length - 1);
        setHistoryIndex(newIndex);
        setInput(userMessages[userMessages.length - 1 - newIndex]);
        return;
      }
    }

    // Down arrow: browse forward in history (cursor on last line, not locked)
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.metaKey && !e.altKey) {
      if (!historyLockedRef.current && historyIndex > -1 && isOnLastLine()) {
        e.preventDefault();
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        if (newIndex === -1) {
          setInput(savedDraftRef.current);
        } else {
          setInput(userMessages[userMessages.length - 1 - newIndex]);
        }
        return;
      }
    }

    if (e.key === 'Enter') {
      // Alt+Enter = follow-up (queue for after agent finishes)
      if (e.altKey && isStreaming) {
        e.preventDefault();
        handleFollowUp();
        return;
      }
      // Cmd/Ctrl+Enter = newline
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const { selectionStart, selectionEnd } = e.currentTarget;
        const before = input.slice(0, selectionStart);
        const after = input.slice(selectionEnd);
        setInput(before + '\n' + after);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            const pos = selectionStart + 1;
            textareaRef.current.selectionStart = pos;
            textareaRef.current.selectionEnd = pos;
          }
        });
      } else if (!e.shiftKey) {
        // Enter = send (or steer if streaming)
        e.preventDefault();
        handleSend();
      }
    }
  };

  /** Process dropped/pasted/picked image files: save to disk, add to state */
  const addImageFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const attachment = await saveImageToDisk(file);
        setImages(prev => [...prev, attachment]);
      } catch (err) {
        console.error('[MessageInput] Failed to save image:', err);
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

  const handleSelectModel = (provider: string, modelId: string) => {
    onSelectModel(provider, modelId);
    setModelPickerOpen(false);
  };

  const modelLabel = modelInfo
    ? modelInfo.id.replace(/-\d{8}$/, '')
    : model
      ? model.replace(/^.*\//, '').replace(/-\d{8}$/, '')
      : 'Model';

  return (
    <div
      className="px-4 py-3 relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/10 border-2 border-accent border-dashed rounded-lg flex items-center justify-center z-10">
          <p className="text-accent text-lg font-semibold">Drop files to attach</p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Prompt picker popover */}
      {promptPickerOpen && (
        <PromptPicker
          onSelect={handlePromptSelect}
          onClose={() => setPromptPickerOpen(false)}
          onCreateNew={() => {
            setPromptPickerOpen(false);
            setPromptEditorOpen(true);
          }}
        />
      )}

      {/* Prompt fill dialog */}
      {promptFillTarget && (
        <PromptFillDialog
          prompt={promptFillTarget.prompt}
          initialFirstValue={promptFillTarget.initialValue}
          onInsert={handlePromptFilled}
          onCancel={() => setPromptFillTarget(null)}
        />
      )}

      {/* Prompt editor */}
      {promptEditorOpen && (
        <PromptEditor
          prompt={null}
          onClose={() => setPromptEditorOpen(false)}
        />
      )}

      {/* Slash command autocomplete menu */}
      <SlashCommandMenu
        commands={filteredSlashCommands}
        selectedIndex={clampedSlashIndex}
        onSelect={handleSlashSelect}
        onHover={setSlashSelectedIndex}
        visible={slashMenuVisible}
      />

      {/* File mention autocomplete menu */}
      <FileMentionMenu
        files={mentionFiles}
        selectedIndex={mentionSelectedIndex}
        onSelect={handleMentionSelect}
        onHover={setMentionSelectedIndex}
        visible={mentionVisible && !slashMenuVisible}
        loading={mentionLoading}
        hasQuery={mentionQuery.length > 0}
      />

      {/* Attached file pills */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 mb-1.5">
          {attachedFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 border border-accent/20 text-xs text-accent max-w-[280px]"
            >
              <span className="truncate font-mono">{file.relativePath}</span>
              <button
                onClick={() => setAttachedFiles(prev => prev.filter(f => f.path !== file.path))}
                className="flex-shrink-0 hover:text-error transition-colors ml-0.5"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Memory command banner (hide when slash menu is up) */}
      {(isMemoryCommand || (isSlashMemory && !slashMenuVisible)) && (
        <div className="mb-1.5 px-1">
          <div className="flex items-center gap-2 text-xs text-accent/80 bg-accent/5 border border-accent/20 rounded-lg px-3 py-1.5">
            <span>💾</span>
            <span>
              {isSlashMemory
                ? 'Opens memory panel'
                : input.match(/^#\s*forget\s/i)
                  ? 'Memory command — will forget matching memory'
                  : 'Memory command — type to remember or forget'}
            </span>
          </div>
        </div>
      )}

      {/* Queued messages indicator */}
      {isStreaming && queued && (queued.steering.length > 0 || queued.followUp.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {queued.steering.map((msg, i) => (
            <div
              key={`s-${i}`}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600/15 border border-amber-600/30 text-xs text-amber-400 max-w-[280px]"
            >
              <Zap className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{msg}</span>
            </div>
          ))}
          {queued.followUp.map((msg, i) => (
            <div
              key={`f-${i}`}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600/15 border border-blue-600/30 text-xs text-blue-400 max-w-[280px]"
            >
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Unified input box */}
      <div className={`bg-bg-surface border ${isMemoryCommand || isSlashMemory || slashMenuVisible ? 'border-accent/40' : isStreaming ? 'border-amber-600/40' : 'border-border'} rounded-xl overflow-hidden transition-colors focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 ${disabled ? 'opacity-50' : ''}`}>
        {/* Image previews inside the box */}
        {images.length > 0 && (
          <div className="flex gap-2 px-3 pt-3 flex-wrap">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-14 w-14 object-cover rounded-md border border-border"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 bg-error text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={disabled ? "Complete setup to start chatting" : isStreaming ? "Steer the agent (Alt+Enter to follow-up)..." : "Ask the agent anything..."}
          className={`w-full bg-transparent px-4 pt-3 pb-1 text-text-primary resize-none focus:outline-none ${disabled ? 'cursor-not-allowed' : ''}`}
          style={{ minHeight: '36px', maxHeight: '200px' }}
          rows={1}
        />

        {/* Bottom toolbar row */}
        <div className="flex items-center justify-between px-2 pb-2">
          {/* Left: attach + prompts buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleFileClick}
              disabled={disabled}
              className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Attach files"
            >
              <Plus className="w-4 h-4" />
            </button>
            <PromptLibraryButton
              onClick={() => setPromptPickerOpen(!promptPickerOpen)}
              disabled={disabled}
            />
          </div>

          {/* Right: thinking toggle + model selector + send/stop */}
          <div className="flex items-center gap-1">
            <button
              onClick={onCycleThinking}
              disabled={disabled}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                thinkingLevel !== 'off'
                  ? 'text-accent hover:text-accent/80 hover:bg-bg-elevated'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title={`Thinking: ${thinkingLevel} (Shift+Tab to cycle)`}
            >
              <span>💭</span>
              <span className="capitalize">{thinkingLevel}</span>
            </button>
            <button
              ref={modelBtnRef}
              onClick={() => setModelPickerOpen(!modelPickerOpen)}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Select model"
            >
              <span className="max-w-[120px] truncate">{modelLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelPickerOpen && (
              <ModelPicker
                currentModel={model}
                currentModelInfo={modelInfo}
                onSelect={handleSelectModel}
                onClose={() => setModelPickerOpen(false)}
                anchorRef={modelBtnRef}
              />
            )}

            {isStreaming ? (
              <div className="flex items-center gap-1">
                {/* Follow-up button (Alt+Enter) */}
                {input.trim() && (
                  <button
                    onClick={handleFollowUp}
                    className="h-7 px-2 rounded-lg bg-blue-600 text-white flex items-center gap-1 justify-center hover:bg-blue-500 transition-all flex-shrink-0 text-[10px] font-medium"
                    title="Queue follow-up (Alt+Enter) — delivered after agent finishes"
                  >
                    <Clock className="w-3 h-3" />
                  </button>
                )}
                {/* Steer button (Enter) */}
                {input.trim() && (
                  <button
                    onClick={handleSend}
                    className="h-7 px-2 rounded-lg bg-amber-600 text-white flex items-center gap-1 justify-center hover:bg-amber-500 transition-all flex-shrink-0 text-[10px] font-medium"
                    title="Steer agent (Enter) — interrupts after current tool"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                )}
                {/* Stop button (Esc) — always visible when streaming */}
                <button
                  onClick={onAbort}
                  className="h-7 w-7 rounded-lg bg-error text-white flex items-center justify-center hover:bg-error/80 transition-all flex-shrink-0"
                  title="Stop (Esc)"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!input.trim() && images.length === 0) || disabled}
                className="h-7 w-7 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
                title="Send"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


