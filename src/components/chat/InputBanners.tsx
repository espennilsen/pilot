/**
 * InputBanners — Contextual banners displayed above the message input.
 *
 * Shows attached file pills (with remove), memory command hint,
 * and queued steering/follow-up indicators during streaming.
 */

import { Zap, Clock } from 'lucide-react';
import type { FileMention } from './FileMentionMenu';

interface InputBannersProps {
  /** Files attached via @mention */
  attachedFiles: FileMention[];
  onRemoveFile: (path: string) => void;
  /** Whether the input starts with # (memory command) */
  isMemoryCommand: boolean;
  /** Whether the input is exactly /memory */
  isSlashMemory: boolean;
  /** Whether the slash command menu is currently visible */
  slashMenuVisible: boolean;
  /** The raw input text (for memory command subtype detection) */
  input: string;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Queued messages (steering + follow-up) shown during streaming */
  queued?: { steering: string[]; followUp: string[] };
}

export function InputBanners({
  attachedFiles,
  onRemoveFile,
  isMemoryCommand,
  isSlashMemory,
  slashMenuVisible,
  input,
  isStreaming,
  queued,
}: InputBannersProps) {
  return (
    <>
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
                onClick={() => onRemoveFile(file.path)}
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
    </>
  );
}
