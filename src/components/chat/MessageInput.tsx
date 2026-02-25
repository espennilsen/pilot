import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { useChatStore } from '../../stores/chat-store';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import SlashCommandMenu, { type SlashCommand } from './SlashCommandMenu';
import FileMentionMenu, { type FileMention } from './FileMentionMenu';
import PromptPicker from '../prompts/PromptPicker';
import { PromptFillDialog } from '../prompts/PromptFillDialog';
import PromptEditor from '../prompts/PromptEditor';
import { useImageAttachments } from './useImageAttachments';
import { InputBanners } from './InputBanners';
import { InputToolbar } from './InputToolbar';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTabId = useTabStore(s => s.activeTabId);
  const model = useChatStore(s => activeTabId ? s.modelByTab[activeTabId] : undefined);
  const modelInfo = useChatStore(s => activeTabId ? s.modelInfoByTab[activeTabId] : undefined);
  const queued = useChatStore(s => activeTabId ? s.queuedByTab[activeTabId] : undefined);
  const thinkingLevel = useChatStore(s => activeTabId ? (s.thinkingByTab[activeTabId] || 'off') : 'off');

  // Image attachments hook
  const {
    images, isDragging, setIsDragging, fileInputRef,
    handleDrop, handlePaste, handleFileClick, handleFileChange,
    removeImage, clearImages,
  } = useImageAttachments(activeTabId);

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

  // Detect if we should show slash command menu
  const slashMatch = input.match(/^\/(\S*)$/);
  const slashFilter = slashMatch ? slashMatch[1] : '';
  const isSlashMode = slashMatch !== null && !isStreaming;

  // Load slash commands every time the slash menu opens
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

  // @mention context detection
  const getMentionContext = useCallback((): { query: string; start: number; end: number } | null => {
    const ta = textareaRef.current;
    if (!ta) return null;
    const cursorPos = ta.selectionStart;
    const text = ta.value;
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
    }, 80);
  }, []);

  // Handle @mention file selection
  const handleMentionSelect = useCallback((file: FileMention) => {
    const ctx = getMentionContext();
    if (!ctx) return;
    const before = input.substring(0, ctx.start);
    const after = input.substring(ctx.end);
    const mention = `@${file.relativePath} `;
    const newInput = before + mention + after;
    setInput(newInput);
    setAttachedFiles(prev =>
      prev.some(f => f.path === file.path) ? prev : [...prev, file]
    );
    setMentionVisible(false);
    setMentionFiles([]);
    setMentionSelectedIndex(0);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = ctx.start + mention.length;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
      }
    });
  }, [input, getMentionContext]);

  // Filtered slash commands
  const filteredSlashCommands = slashCommands.filter(cmd => {
    if (!slashFilter) return true;
    const f = slashFilter.toLowerCase();
    return cmd.name.toLowerCase().includes(f) || cmd.description.toLowerCase().includes(f);
  });

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashFilter]);

  const clampedSlashIndex = Math.min(slashSelectedIndex, Math.max(0, filteredSlashCommands.length - 1));

  const handleSlashSelect = useCallback(async (cmd: SlashCommand) => {
    setSlashMenuVisible(false);
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
      } catch { /* fall through */ }
    }
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
      setInput(prompt.content);
      textareaRef.current?.focus();
    } else {
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

  // ── Message history navigation ───────────────────────────────────

  const messages = useChatStore(s => activeTabId ? s.messagesByTab[activeTabId] : undefined);
  const userMessages = (messages || []).filter(m => m.role === 'user').map(m => m.content);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const savedDraftRef = useRef('');
  const historyLockedRef = useRef(false);

  const resetHistory = () => {
    setHistoryIndex(-1);
    historyLockedRef.current = false;
  };

  const handleInputChange = (value: string) => {
    if (historyIndex > -1) {
      const historyValue = userMessages[userMessages.length - 1 - historyIndex];
      if (value !== historyValue) {
        historyLockedRef.current = true;
      }
    }
    setInput(value);
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

  const isOnFirstLine = () => {
    const ta = textareaRef.current;
    if (!ta) return false;
    return !ta.value.substring(0, ta.selectionStart).includes('\n');
  };

  const isOnLastLine = () => {
    const ta = textareaRef.current;
    if (!ta) return false;
    return !ta.value.substring(ta.selectionEnd).includes('\n');
  };

  // ── Send / Follow-up ────────────────────────────────────────────

  const handleSend = async () => {
    if ((!input.trim() && images.length === 0) || disabled) return;

    try {
      // Check if it's a prompt slash command
      if (!isStreaming && input.startsWith('/')) {
        const slashCmdMatch = input.match(/^\/([a-z][a-z0-9-]*)\s*(.*)?$/s);
        if (slashCmdMatch) {
          const [, cmdName, inlineText] = slashCmdMatch;
          try {
            const prompt = await invoke(IPC.PROMPTS_GET_BY_COMMAND, cmdName) as PromptTemplate | null;
            if (prompt) {
              setInput('');
              if (prompt.variables.length === 0) {
                onSend(prompt.content);
                clearImages();
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

      // Build the final message with file context and image paths
      let finalText = input.trim();
      if (attachedFiles.length > 0 && !isStreaming) {
        const fileList = attachedFiles.map(f => f.relativePath).join(', ');
        finalText = `[Attached files: ${fileList}]\n\nRead the attached files first, then respond to:\n\n${finalText}`;
      }

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

      setInput('');
      clearImages();
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
    clearImages();
    resetHistory();
  };

  // ── Keyboard handler ─────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // File mention menu keyboard navigation
    if (mentionVisible && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSelectedIndex(i => Math.min(i + 1, mentionFiles.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSelectedIndex(i => Math.max(i - 1, 0)); return; }
      if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const file = mentionFiles[mentionSelectedIndex];
        if (file) handleMentionSelect(file);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setMentionVisible(false); return; }
    }

    // Slash command menu keyboard navigation
    if (slashMenuVisible && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSelectedIndex(i => Math.min(i + 1, filteredSlashCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSelectedIndex(i => Math.max(i - 1, 0)); return; }
      if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const cmd = filteredSlashCommands[clampedSlashIndex];
        if (cmd) handleSlashSelect(cmd);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashMenuVisible(false); return; }
    }

    // Escape = stop agent when streaming
    if (e.key === 'Escape' && isStreaming && !slashMenuVisible && !mentionVisible) {
      e.preventDefault(); onAbort(); return;
    }

    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onCycleThinking(); return; }

    // Up arrow: browse message history
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.altKey) {
      if (!historyLockedRef.current && isOnFirstLine() && userMessages.length > 0) {
        e.preventDefault();
        if (historyIndex === -1) savedDraftRef.current = input;
        const newIndex = Math.min(historyIndex + 1, userMessages.length - 1);
        setHistoryIndex(newIndex);
        setInput(userMessages[userMessages.length - 1 - newIndex]);
        return;
      }
    }

    // Down arrow: browse forward in history
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.metaKey && !e.altKey) {
      if (!historyLockedRef.current && historyIndex > -1 && isOnLastLine()) {
        e.preventDefault();
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(newIndex === -1 ? savedDraftRef.current : userMessages[userMessages.length - 1 - newIndex]);
        return;
      }
    }

    if (e.key === 'Enter') {
      if (e.altKey && isStreaming) { e.preventDefault(); handleFollowUp(); return; }
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
        e.preventDefault(); handleSend();
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────

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
          onCreateNew={() => { setPromptPickerOpen(false); setPromptEditorOpen(true); }}
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
        <PromptEditor prompt={null} onClose={() => setPromptEditorOpen(false)} />
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

      {/* Banners: attached files, memory command, queued messages */}
      <InputBanners
        attachedFiles={attachedFiles}
        onRemoveFile={(path) => setAttachedFiles(prev => prev.filter(f => f.path !== path))}
        isMemoryCommand={isMemoryCommand}
        isSlashMemory={isSlashMemory}
        slashMenuVisible={slashMenuVisible}
        input={input}
        isStreaming={isStreaming}
        queued={queued}
      />

      {/* Unified input box */}
      <div className={`bg-bg-surface border ${isMemoryCommand || isSlashMemory || slashMenuVisible ? 'border-accent/40' : isStreaming ? 'border-amber-600/40' : 'border-border'} rounded-xl overflow-hidden transition-colors focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 ${disabled ? 'opacity-50' : ''}`}>
        {/* Image previews inside the box */}
        {images.length > 0 && (
          <div className="flex gap-2 px-3 pt-3 flex-wrap">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <img src={img.previewUrl} alt={img.name} className="h-14 w-14 object-cover rounded-md border border-border" />
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

        {/* Bottom toolbar */}
        <InputToolbar
          model={model}
          modelInfo={modelInfo}
          thinkingLevel={thinkingLevel}
          isStreaming={isStreaming}
          hasInput={!!input.trim()}
          hasImages={images.length > 0}
          disabled={!!disabled}
          promptPickerOpen={promptPickerOpen}
          onTogglePromptPicker={() => setPromptPickerOpen(!promptPickerOpen)}
          onFileClick={handleFileClick}
          onCycleThinking={onCycleThinking}
          onSelectModel={onSelectModel}
          onSend={handleSend}
          onFollowUp={handleFollowUp}
          onAbort={onAbort}
        />
      </div>
    </div>
  );
}
