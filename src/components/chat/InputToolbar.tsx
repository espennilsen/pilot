/**
 * InputToolbar — Bottom toolbar row of the message input box.
 *
 * Left side: attach files button, prompt library button.
 * Right side: thinking toggle, model selector, send/steer/stop buttons.
 */

import { useRef, useState } from 'react';
import { Plus, ArrowUp, Square, ChevronDown, Zap, Clock } from 'lucide-react';
import { ModelPicker } from './ModelPicker';
import { PromptLibraryButton } from '../prompts/PromptLibraryButton';

interface InputToolbarProps {
  /** Currently selected model string (provider/model-id) */
  model: string | undefined;
  /** Rich model info (with display name, etc.) */
  modelInfo: { id: string; provider: string; name?: string } | undefined;
  /** Current thinking level */
  thinkingLevel: string;
  /** Whether the agent is streaming */
  isStreaming: boolean;
  /** Whether the input has text */
  hasInput: boolean;
  /** Whether images are attached */
  hasImages: boolean;
  /** Whether controls are disabled */
  disabled: boolean;
  /** Whether the prompt picker is open */
  promptPickerOpen: boolean;
  onTogglePromptPicker: () => void;
  onFileClick: () => void;
  onCycleThinking: () => void;
  onSelectModel: (provider: string, modelId: string) => void;
  onSend: () => void;
  onFollowUp: () => void;
  onAbort: () => void;
}

export function InputToolbar({
  model,
  modelInfo,
  thinkingLevel,
  isStreaming,
  hasInput,
  hasImages,
  disabled,
  promptPickerOpen,
  onTogglePromptPicker,
  onFileClick,
  onCycleThinking,
  onSelectModel,
  onSend,
  onFollowUp,
  onAbort,
}: InputToolbarProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

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
    <div className="flex items-center justify-between px-2 pb-2">
      {/* Left: attach + prompts buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onFileClick}
          disabled={disabled}
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Attach files"
        >
          <Plus className="w-4 h-4" />
        </button>
        <PromptLibraryButton
          onClick={onTogglePromptPicker}
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
            {hasInput && (
              <button
                onClick={onFollowUp}
                className="h-7 px-2 rounded-lg bg-blue-600 text-white flex items-center gap-1 justify-center hover:bg-blue-500 transition-all flex-shrink-0 text-[10px] font-medium"
                title="Queue follow-up (Alt+Enter) — delivered after agent finishes"
              >
                <Clock className="w-3 h-3" />
              </button>
            )}
            {/* Steer button (Enter) */}
            {hasInput && (
              <button
                onClick={onSend}
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
            onClick={onSend}
            disabled={(!hasInput && !hasImages) || disabled}
            className="h-7 w-7 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
            title="Send"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
