import { useRef, useEffect, useState, useMemo } from 'react';
import { useChatStore, type ChatMessage } from '../../stores/chat-store';
import { useTabStore } from '../../stores/tab-store';
import { useAuthStore } from '../../stores/auth-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useProjectStore } from '../../stores/project-store';
import { useAgentSession } from '../../hooks/useAgentSession';
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

  // Instant scroll to bottom on tab switch, smooth scroll for new messages
  useEffect(() => {
    if (!autoScroll || !messagesEndRef.current) return;
    const isTabSwitch = prevTabIdRef.current !== activeTabId;
    prevTabIdRef.current = activeTabId;
    messagesEndRef.current.scrollIntoView({ behavior: isTabSwitch ? 'instant' : 'smooth' });
  }, [messages, autoScroll, activeTabId]);

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
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
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
