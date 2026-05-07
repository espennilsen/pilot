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
import SuggestionChips from './SuggestionChips';
import WelcomeScreen from '../onboarding/WelcomeScreen';
import FindBar from '../shared/FindBar';

const EMPTY_SUGGESTIONS: string[] = [];

/** Escape a string for use in RegExp */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface TextMatch {
  node: Text;
  start: number;
  end: number;
}

/** Walk all text nodes in a container and find regex matches. */
function findTextMatches(container: HTMLElement, query: string, caseSensitive: boolean): TextMatch[] {
  if (!query) return [];
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapeRegex(query), flags);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const matches: TextMatch[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    let match: RegExpExecArray | null;
    // Reset regex state for each text node
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ node: node as Text, start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) break;
    }
  }
  return matches;
}

/** Clear CSS Custom Highlights from a named group. */
function clearChatHighlights() {
  try {
    CSS.highlights?.delete('chat-find-match');
    CSS.highlights?.delete('chat-find-match-active');
  } catch { /* Expected: CSS highlights may not be available */ }
}

/** Apply CSS Custom Highlights for all matches and the active match. */
function applyChatHighlights(matches: TextMatch[], activeIndex: number) {
  if (!CSS.highlights || matches.length === 0) return;
  const all = new Highlight();
  const active = new Highlight();
  for (let i = 0; i < matches.length; i++) {
    const range = new Range();
    range.setStart(matches[i].node, matches[i].start);
    range.setEnd(matches[i].node, matches[i].end);
    all.add(range);
    if (i === activeIndex) active.add(range);
  }
  CSS.highlights.set('chat-find-match', all);
  CSS.highlights.set('chat-find-match-active', active);
}

/** Scroll a container so a text match is visible in the viewport. */
function scrollToMatchInContainer(match: TextMatch, container: HTMLElement) {
  const range = new Range();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  const rect = range.getBoundingClientRect();
  if (!rect || rect.top === 0) return;
  const containerRect = container.getBoundingClientRect();
  const targetTop = rect.top - containerRect.top + container.scrollTop - container.clientHeight / 3;
  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

export default function ChatView() {
  const activeTabId = useTabStore(s => s.activeTabId);
  const messagesByTab = useChatStore(s => s.messagesByTab);
  const messages = useMemo(() => (activeTabId ? messagesByTab[activeTabId] ?? [] : []), [messagesByTab, activeTabId]);
  const isStreaming = useChatStore(s => activeTabId ? s.streamingByTab[activeTabId] : false);
  const suggestions = useChatStore(s => activeTabId ? s.suggestionsByTab[activeTabId] ?? EMPTY_SUGGESTIONS : EMPTY_SUGGESTIONS);
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

  // ── In-page find ──────────────────────────────────────────────────────

  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findCurrentIndex, setFindCurrentIndex] = useState(0);
  const findMatchesRef = useRef<TextMatch[]>([]);

  // Inject CSS Custom Highlight styles once
  useEffect(() => {
    const id = 'chat-find-highlight-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        ::highlight(chat-find-match) {
          background-color: var(--color-accent, #4f46e5);
          color: var(--color-bg-base, #1a1b1e);
          border-radius: 2px;
        }
        ::highlight(chat-find-match-active) {
          background-color: var(--color-warning, #f59e0b);
          color: var(--color-bg-base, #1a1b1e);
          border-radius: 2px;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Keyboard: Cmd/Ctrl+F opens find, Escape closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Only handle Cmd+F if focus is within the chat component
      const chatContainer = document.querySelector('[data-chat-container]');
      if (chatContainer && !chatContainer.contains(e.target as Node)) {
        return;
      }
      if (e.key === 'f' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setFindVisible(true);
      }
      if (e.key === 'Escape' && findVisible) {
        e.preventDefault();
        setFindVisible(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [findVisible]);

  // Run search and apply highlights whenever query, case sensitivity, or messages change
  useEffect(() => {
    if (!findVisible || !findQuery || !scrollContainerRef.current) {
      clearChatHighlights();
      setFindMatchCount(0);
      setFindCurrentIndex(-1);
      findMatchesRef.current = [];
      return;
    }

    const container = scrollContainerRef.current;
    const matches = findTextMatches(container, findQuery, findCaseSensitive);
    findMatchesRef.current = matches;
    setFindMatchCount(matches.length);

    if (matches.length > 0) {
      // Preserve previous index or clamp to valid range
      const prevIndex = findCurrentIndex >= 0 ? findCurrentIndex : 0;
      const idx = Math.max(0, Math.min(prevIndex, matches.length - 1));
      setFindCurrentIndex(idx);
      applyChatHighlights(matches, idx);
      requestAnimationFrame(() => scrollToMatchInContainer(matches[idx], container));
    } else {
      setFindCurrentIndex(-1);
      clearChatHighlights();
    }

    return () => clearChatHighlights();
  }, [findVisible, findQuery, findCaseSensitive, messages]);

  // Navigate to a specific match index
  const goToFindMatch = useCallback((index: number) => {
    const matches = findMatchesRef.current;
    if (matches.length === 0 || !scrollContainerRef.current) return;
    const idx = ((index % matches.length) + matches.length) % matches.length;
    setFindCurrentIndex(idx);
    applyChatHighlights(matches, idx);
    scrollToMatchInContainer(matches[idx], scrollContainerRef.current);
  }, []);

  /**
   * Regenerate: fork the session at the user message that preceded this assistant message,
   * then re-prompt with the same user text.
   */
  const handleRegenerate = useCallback(async (assistantMsgIndex: number) => {
    if (!activeTabId || isStreaming) return;
    setEditingIndex(null);

    // Find the user message that preceded this assistant message
    const userMsg = messages.slice(0, assistantMsgIndex).findLast(m => m.role === 'user');
    if (!userMsg) return;

    try {
      // Get fork points from the SDK session
      const forkPoints = await invoke(IPC.SESSION_GET_FORK_POINTS, activeTabId) as Array<{ entryId: string; text: string }>;
      
      // Find the entry ID for this user message by matching text.
      // If the user sent the same message multiple times, count prior occurrences
      // and pick the Nth matching fork point.
      const sameTextBefore = messages
        .slice(0, assistantMsgIndex)
        .filter(m => m.role === 'user' && m.content === userMsg.content).length - 1;
      let seen = 0;
      const forkPoint = forkPoints.find(fp => {
        if (fp.text !== userMsg.content) return false;
        return seen++ === sameTextBefore;
      });
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

      // Snapshot original messages before clearing
      const originalMessages = [...messages];

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
      try {
        await sendMessage(forkResult.selectedText);
      } catch (sendErr) {
        console.error('[ChatView] sendMessage failed during regenerate:', sendErr);
        // Restore original messages
        clearMessages(activeTabId);
        for (const msg of originalMessages) {
          addMessage(activeTabId, msg);
        }
      }
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
      
      // Count prior user messages with the same content up to editingIndex
      const sameTextBefore = messages
        .slice(0, editingIndex)
        .filter(m => m.role === 'user' && m.content === originalMsg.content).length;
      let seen = 0;
      const forkPoint = forkPoints.find(fp => {
        if (fp.text !== originalMsg.content) return false;
        return seen++ === sameTextBefore;
      });
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

      // Snapshot original messages before clearing
      const originalMessages = [...messages];

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
      try {
        await sendMessage(editedContent);
      } catch (sendErr) {
        console.error('[ChatView] sendMessage failed during edit & resend:', sendErr);
        // Restore original messages
        clearMessages(activeTabId);
        for (const msg of originalMessages) {
          addMessage(activeTabId, msg);
        }
      }
    } catch (err) {
      console.error('[ChatView] Edit & resend failed:', err);
      setEditingIndex(null);
    }
  }, [activeTabId, editingIndex, messages, isStreaming, sendMessage]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-bg-base" data-chat-container>
      {/* Chat Header */}
      <ChatHeader isStreaming={!!isStreaming} />

      {/* Messages Area */}
      <div className="flex-1 relative overflow-hidden">
        <FindBar
          query={findQuery}
          onQueryChange={setFindQuery}
          caseSensitive={findCaseSensitive}
          onCaseSensitiveChange={setFindCaseSensitive}
          matchCount={findMatchCount}
          currentIndex={findCurrentIndex}
          onPrev={() => goToFindMatch(findCurrentIndex - 1)}
          onNext={() => goToFindMatch(findCurrentIndex + 1)}
          onClose={() => setFindVisible(false)}
          visible={findVisible}
        />
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-4 py-4"
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
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-bg-surface border-2 border-dashed border-border flex items-center justify-center">
                    <FolderOpen className="w-7 h-7 text-text-secondary" />
                  </div>
                  <p className="text-text-secondary text-xl font-medium">No project open</p>
                  <p className="text-text-secondary/50 text-sm">Open a project to start chatting with the agent</p>
                  <button
                    onClick={openProjectDialog}
                    className="inline-flex items-center gap-2.5 px-6 py-3 text-base font-medium text-white bg-accent hover:bg-accent/90 rounded-lg transition-colors shadow-lg shadow-accent/20"
                  >
                    <FolderOpen className="w-5 h-5" />
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
                isStreaming={isStreaming}
                onRegenerate={handleRegenerate}
                onEditAndResend={handleEditAndResend}
                onEditSubmit={handleEditSubmit}
                onEditCancel={handleEditCancel}
              />
            ))}
            {/* Follow-up suggestion chips */}
            {!isStreaming && suggestions.length > 0 && (
              <SuggestionChips suggestions={suggestions} onSelect={sendMessage} />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
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
        disabled={showWelcome || !activeTabId || !projectPath}
      />
    </div>
  );
}
