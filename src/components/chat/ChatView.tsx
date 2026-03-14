import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useChatStore, type ChatMessage } from '../../stores/chat-store';
import { useTabStore } from '../../stores/tab-store';
import { useAuthStore } from '../../stores/auth-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useProjectStore } from '../../stores/project-store';
import { useAgentSession } from '../../hooks/useAgentSession';
import { invoke } from '../../lib/ipc-client';
import { IPC } from '../../../shared/ipc';
import { FolderOpen } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import WelcomeScreen from '../onboarding/WelcomeScreen';

export default function ChatView() {
  const activeTabId = useTabStore(s => s.activeTabId);
  const messagesByTab = useChatStore(s => s.messagesByTab);
  const messages = useMemo(() => (activeTabId ? messagesByTab[activeTabId] ?? [] : []), [messagesByTab, activeTabId]);
  const isStreaming = useChatStore(s => activeTabId ? s.streamingByTab[activeTabId] : false);
  const { sendMessage, steerAgent, followUpAgent, abortAgent, cycleModel, selectModel, cycleThinking } = useAgentSession();
  const { hasAnyAuth, loadStatus: loadAuthStatus } = useAuthStore();
  const { onboardingComplete, load: loadAppSettings } = useAppSettingsStore();
  const { projectPath, openProjectDialog } = useProjectStore();

  // Load auth status and app settings on mount
  useEffect(() => {
    loadAuthStatus();
    loadAppSettings();
  }, [loadAuthStatus, loadAppSettings]);

  const showWelcome = !onboardingComplete;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevTabIdRef = useRef(activeTabId);

  // Scroll to bottom: instant during streaming or tab switch, smooth for new messages
  useEffect(() => {
    if (!autoScroll || !messagesEndRef.current) return;
    const isTabSwitch = prevTabIdRef.current !== activeTabId;
    prevTabIdRef.current = activeTabId;
    // Use instant scroll during streaming to keep up with rapid content additions.
    // Smooth scroll can't keep pace and causes the view to lag behind.
    const behavior = isTabSwitch || isStreaming ? 'instant' : 'smooth';
    messagesEndRef.current.scrollIntoView({ behavior });
  }, [messages, autoScroll, activeTabId, isStreaming]);

  // Reset auto-scroll when switching tabs
  useEffect(() => {
    setAutoScroll(true);
  }, [activeTabId]);

  // Smart scroll pause: stop auto-scroll when user scrolls up
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  // ── Message actions: regenerate & edit ──────────────────────────────

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Reset editing state when tab switches
  useEffect(() => {
    setEditingIndex(null);
  }, [activeTabId]);

  /**
   * Regenerate: fork the session at the user message that preceded this assistant message,
   * then re-prompt with the same user text.
   */
  const handleRegenerate = useCallback(async (assistantMsgIndex: number) => {
    if (!activeTabId || isStreaming) return;

    // Find the user message that preceded this assistant message
    const userMsg = messages.slice(0, assistantMsgIndex).findLast(m => m.role === 'user');
    if (!userMsg) return;

    try {
      // Get fork points from the SDK session
      const forkPoints = await invoke(IPC.SESSION_GET_FORK_POINTS, activeTabId) as Array<{ entryId: string; text: string }>;
      
      // Find the entry ID for this user message by matching text
      const forkPoint = forkPoints.find(fp => fp.text === userMsg.content);
      if (!forkPoint) {
        console.warn('[ChatView] Could not find fork point for user message');
        return;
      }

      // Fork the session at this entry
      const forkResult = await invoke(IPC.SESSION_FORK, activeTabId, forkPoint.entryId) as {
        selectedText: string;
        cancelled: boolean;
        history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
      };

      if (forkResult.cancelled) return;

      // Clear renderer messages and reload from the forked session history
      const { clearMessages, addMessage } = useChatStore.getState();
      clearMessages(activeTabId);
      for (const h of forkResult.history) {
        addMessage(activeTabId, {
          id: crypto.randomUUID(),
          role: h.role,
          content: h.content,
          timestamp: h.timestamp || Date.now(),
        });
      }

      // Re-prompt with the same text — this sends to the forked session
      await sendMessage(forkResult.selectedText);
    } catch (err) {
      console.error('[ChatView] Regenerate failed:', err);
    }
  }, [activeTabId, messages, isStreaming, sendMessage]);

  /**
   * Edit & resend: enter editing mode for a user message.
   */
  const handleEditAndResend = useCallback((messageIndex: number, _content: string) => {
    setEditingIndex(messageIndex);
  }, []);

  /**
   * Submit the edited message: fork at the original user message, then send the edited text.
   */
  const handleEditSubmit = useCallback(async (editedContent: string) => {
    if (!activeTabId || editingIndex === null || isStreaming) return;

    const originalMsg = messages[editingIndex];
    if (!originalMsg || originalMsg.role !== 'user') return;

    try {
      // Get fork points
      const forkPoints = await invoke(IPC.SESSION_GET_FORK_POINTS, activeTabId) as Array<{ entryId: string; text: string }>;
      
      const forkPoint = forkPoints.find(fp => fp.text === originalMsg.content);
      if (!forkPoint) {
        console.warn('[ChatView] Could not find fork point for user message');
        setEditingIndex(null);
        return;
      }

      // Fork the session
      const forkResult = await invoke(IPC.SESSION_FORK, activeTabId, forkPoint.entryId) as {
        selectedText: string;
        cancelled: boolean;
        history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
      };

      if (forkResult.cancelled) {
        setEditingIndex(null);
        return;
      }

      // Clear and reload from forked history
      const { clearMessages, addMessage } = useChatStore.getState();
      clearMessages(activeTabId);
      for (const h of forkResult.history) {
        addMessage(activeTabId, {
          id: crypto.randomUUID(),
          role: h.role,
          content: h.content,
          timestamp: h.timestamp || Date.now(),
        });
      }

      setEditingIndex(null);

      // Send the edited content
      await sendMessage(editedContent);
    } catch (err) {
      console.error('[ChatView] Edit & resend failed:', err);
      setEditingIndex(null);
    }
  }, [activeTabId, editingIndex, messages, isStreaming, sendMessage]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-bg-base">
      {/* Chat Header */}
      <ChatHeader isStreaming={!!isStreaming} />

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {showWelcome ? (
          <WelcomeScreen />
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              {projectPath ? (
                <>
                  <p className="text-text-secondary text-lg">Start a conversation</p>
                  <p className="text-text-secondary/50 text-sm">Ask the agent anything about your project</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 mx-auto rounded-xl bg-bg-surface border-2 border-dashed border-border flex items-center justify-center">
                    <FolderOpen className="w-6 h-6 text-text-secondary" />
                  </div>
                  <p className="text-text-secondary text-lg">No project open</p>
                  <p className="text-text-secondary/50 text-sm">Open a project to start chatting with the agent</p>
                  <button
                    onClick={openProjectDialog}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Open Project
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                messageIndex={idx}
                isEditing={editingIndex === idx}
                onRegenerate={handleRegenerate}
                onEditAndResend={handleEditAndResend}
                onEditSubmit={handleEditSubmit}
                onEditCancel={handleEditCancel}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <MessageInput
        onSend={sendMessage}
        onSteer={steerAgent}
        onFollowUp={followUpAgent}
        onAbort={abortAgent}
        onSelectModel={selectModel}
        onCycleThinking={cycleThinking}
        isStreaming={!!isStreaming}
        disabled={showWelcome}
      />
    </div>
  );
}
