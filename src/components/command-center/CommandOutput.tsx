import { useEffect, useRef } from 'react';
import { useDevCommandStore } from '../../stores/dev-command-store';
import { useTabStore } from '../../stores/tab-store';
import { useChatStore } from '../../stores/chat-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import { Button } from '../shared/Button';

interface CommandOutputProps {
  commandId: string;
}

export function CommandOutput({ commandId }: CommandOutputProps) {
  const { states, commands } = useDevCommandStore();
  const state = states[commandId];
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [state?.output]);

  if (!state) return null;

  const handleAskFix = () => {
    const activeTabId = useTabStore.getState().activeTabId;
    if (!activeTabId) return;

    const cmd = commands.find((c) => c.id === commandId);
    const cmdLabel = cmd?.label || cmd?.command || commandId;

    // Trim output to last 200 lines to avoid flooding context
    const trimmedOutput = (state.output || '')
      .split('\n')
      .slice(-200)
      .join('\n');

    const prompt = `The command "${cmdLabel}" failed with exit code ${state.exitCode ?? 'unknown'}. Here's the output:\n\n\`\`\`\n${trimmedOutput}\n\`\`\`\n\nCan you help fix this?`;

    // Add as user message and send to agent
    const messageId = crypto.randomUUID();
    useChatStore.getState().addMessage(activeTabId, {
      id: messageId,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    });

    invoke(IPC.AGENT_PROMPT, activeTabId, prompt);
  };

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-hidden">
      <div
        ref={outputRef}
        className="font-mono text-xs text-text-primary p-2 flex-1 overflow-y-auto whitespace-pre-wrap"
      >
        {state.output || 'No output yet...'}
      </div>

      {state.status === 'failed' && (
        <div className="border-t border-border p-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAskFix}
            className="w-full text-xs"
          >
            Ask Agent to Fix
          </Button>
        </div>
      )}
    </div>
  );
}
