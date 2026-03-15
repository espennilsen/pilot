import { useState, useRef, useEffect } from 'react';
import { ChatMessage, ToolCallInfo } from '../../stores/chat-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { useTabStore } from '../../stores/tab-store';
import Markdown from '../../lib/markdown';
import { attachmentUrl } from '../../lib/attachment-url';
import { ToolResult } from './ToolResult';
import StreamingCursor from './StreamingCursor';
import MessageActions from './MessageActions';
import EditMessageOverlay from './EditMessageOverlay';
import CitationsBar, { extractCitations } from './Citations';

/**
 * Markdown renderer optimised for streaming. During rapid text_delta events,
 * the full Markdown parser is expensive to run on every single character.
 * This component throttles re-renders of the Markdown component while keeping
 * text visible immediately via a raw text fallback for the latest chunk.
 */
function StreamingMarkdown({ text }: { text: string }) {
  const [renderedText, setRenderedText] = useState(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTextRef = useRef(text);

  useEffect(() => {
    latestTextRef.current = text;

    // Throttle Markdown re-renders to every 80ms during streaming.
    // Don't clear the timer here — letting it fire naturally gives true
    // throttle semantics (fires every 80ms). Clearing on each text change
    // would turn this into a debounce (only fires after 80ms of silence).
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        setRenderedText(latestTextRef.current);
        timerRef.current = null;
      }, 80);
    }
  }, [text]);

  // Flush on unmount (streaming ends → component swaps to regular Markdown)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Render the throttled markdown, plus any trailing text that hasn't been rendered yet
  const tail = text.slice(renderedText.length);
  return (
    <>
      <Markdown text={renderedText} />
      {tail && <span className="whitespace-pre-wrap">{tail}</span>}
    </>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  messageIndex: number;
  isEditing?: boolean;
  isStreaming?: boolean;
  onRegenerate?: (messageIndex: number) => void;
  onEditAndResend?: (messageIndex: number, content: string) => void;
  onEditSubmit?: (editedContent: string) => void;
  onEditCancel?: () => void;
}

export default function MessageBubble({
  message,
  messageIndex,
  isEditing,
  isStreaming,
  onRegenerate,
  onEditAndResend,
  onEditSubmit,
  onEditCancel,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <UserMessage
        message={message}
        messageIndex={messageIndex}
        isEditing={isEditing}
        isStreaming={isStreaming}
        onEditAndResend={onEditAndResend}
        onEditSubmit={onEditSubmit}
        onEditCancel={onEditCancel}
      />
    );
  }
  return (
    <AssistantMessage
      message={message}
      messageIndex={messageIndex}
      onRegenerate={onRegenerate}
    />
  );
}

/** Match the image attachment prefix injected by MessageInput */
const IMAGE_PREFIX_RE = /^The user attached (?:an image|(\d+) images) to this message\. Use the read tool to view (?:it|each one) before responding:\n([\s\S]*?)\n\n/;

function UserMessage({ message, messageIndex, isEditing, isStreaming, onEditAndResend, onEditSubmit, onEditCancel }: MessageBubbleProps) {
  let displayContent = message.content;
  let imagePaths: string[] = [];

  const match = displayContent.match(IMAGE_PREFIX_RE);
  if (match) {
    // Extract paths (one per line) and strip the prefix from displayed text
    imagePaths = match[2].split('\n').map(p => p.trim()).filter(Boolean);
    displayContent = displayContent.slice(match[0].length);
  }

  // Edit mode
  if (isEditing && onEditSubmit && onEditCancel) {
    return (
      <EditMessageOverlay
        initialContent={displayContent}
        onSubmit={onEditSubmit}
        onCancel={onEditCancel}
      />
    );
  }

  return (
    <div className="group relative border-l-2 border-accent pl-4 py-2">
      {imagePaths.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {imagePaths.map((p, i) => (
            <img
              key={i}
              src={attachmentUrl(p)}
              alt={p.split('/').pop() || 'image'}
              className="h-20 w-20 object-cover rounded-md border border-border"
            />
          ))}
        </div>
      )}
      {displayContent && (
        <div className="text-text-primary whitespace-pre-wrap">{displayContent}</div>
      )}
      <div className="absolute -bottom-3 right-0">
        <MessageActions
          role="user"
          content={displayContent}
          messageIndex={messageIndex}
          isStreaming={isStreaming}
          onEditAndResend={onEditAndResend}
        />
      </div>
    </div>
  );
}

function AssistantMessage({ message, messageIndex, onRegenerate }: MessageBubbleProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  
  if (message.isError) {
    return (
      <div className="text-error bg-error/10 rounded-md p-3 border border-error/30">
        <div className="font-semibold mb-1">Error</div>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    );
  }
  
  return (
    <div className="group relative py-2">
      {/* Thinking section */}
      {message.thinkingContent && (
        <div className="mb-3">
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm mb-1 transition-colors"
          >
            <span className="transform transition-transform" style={{ transform: thinkingExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            <span className="italic">Thinking...</span>
          </button>
          {thinkingExpanded && (
            <div className="text-text-secondary text-sm italic pl-6 whitespace-pre-wrap bg-bg-surface/30 rounded p-2 mt-1">
              {message.thinkingContent}
            </div>
          )}
        </div>
      )}
      
      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="space-y-2 mb-3">
          {message.toolCalls.map((toolCall) => (
            <ToolCallIndicator key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
      
      {/* Retry info */}
      {message.retryInfo && (
        <div className="text-warning bg-warning/10 rounded-md px-3 py-2 mb-3 text-sm border border-warning/30">
          Retrying (attempt {message.retryInfo.attempt}/{message.retryInfo.maxAttempts})... 
          waiting {(message.retryInfo.delayMs / 1000).toFixed(1)}s
        </div>
      )}
      
      {/* Message content */}
      <div className="text-text-primary prose prose-invert max-w-none">
        {message.content && (
          message.isStreaming
            ? <StreamingMarkdown text={message.content} />
            : <Markdown text={message.content} />
        )}
        {message.isStreaming && <StreamingCursor />}
      </div>

      {/* Citations from web search results */}
      {!message.isStreaming && (
        <CitationsBar citations={extractCitations(message.toolCalls)} />
      )}

      {/* Action bar */}
      {!message.isStreaming && message.content && (
        <div className="absolute -bottom-3 right-0">
          <MessageActions
            role="assistant"
            content={message.content}
            messageIndex={messageIndex}
            isStreaming={message.isStreaming}
            onRegenerate={onRegenerate}
          />
        </div>
      )}
    </div>
  );
}

function ToolCallIndicator({ toolCall }: { toolCall: ToolCallInfo }) {
  const activeTabId = useTabStore(s => s.activeTabId);
  const { diffsByTab, acceptDiff, rejectDiff } = useSandboxStore();

  // Find matching staged diff for write/edit/bash tool calls
  const isStageable = toolCall.toolName === 'write' || toolCall.toolName === 'edit' || toolCall.toolName === 'bash';
  const stagedDiff = isStageable && activeTabId
    ? (diffsByTab[activeTabId] || []).find(d => d.toolCallId === toolCall.id)
    : undefined;
  const { setAutoAcceptTool, isAutoAcceptTool } = useSandboxStore();
  const isToolAutoAccepted = activeTabId ? isAutoAcceptTool(activeTabId, toolCall.toolName) : false;
  
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return '⏳';
      case 'completed':
        return '✓';
      case 'error':
        return '✗';
    }
  };
  
  const getStatusColor = () => {
    switch (toolCall.status) {
      case 'running':
        return 'text-text-secondary';
      case 'completed':
        return 'text-success';
      case 'error':
        return 'text-error';
    }
  };
  
  const duration = toolCall.completedAt && toolCall.startedAt
    ? ((toolCall.completedAt - toolCall.startedAt) / 1000).toFixed(2)
    : null;

  // Extract file path or command from tool args for display
  const filePath = toolCall.toolName === 'bash' && toolCall.args
    ? ''
    : isStageable && toolCall.args
      ? (toolCall.args as any).path || (toolCall.args as any).file_path || ''
      : '';
  const bashCommand = toolCall.toolName === 'bash' && toolCall.args
    ? (toolCall.args as any).command || ''
    : '';

  const handleAccept = async () => {
    if (activeTabId && stagedDiff) {
      await acceptDiff(activeTabId, stagedDiff.id);
    }
  };

  const handleAlwaysAccept = async () => {
    if (activeTabId && stagedDiff) {
      setAutoAcceptTool(activeTabId, toolCall.toolName, true);
      await acceptDiff(activeTabId, stagedDiff.id);
    }
  };

  const handleReject = async () => {
    if (activeTabId && stagedDiff) {
      await rejectDiff(activeTabId, stagedDiff.id);
    }
  };

  const diffStatusBadge = stagedDiff ? (
    stagedDiff.status === 'accepted' ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">accepted</span>
    ) : stagedDiff.status === 'rejected' ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/20 text-error font-medium">rejected</span>
    ) : null
  ) : null;
  
  return (
    <div className="bg-bg-surface rounded-md p-2 border border-border">
      <div className="flex items-center gap-2 text-sm">
        <span className={getStatusColor()}>{getStatusIcon()}</span>
        <span className="font-mono text-accent">{toolCall.toolName}</span>
        {filePath && <span className="font-mono text-text-secondary text-xs truncate">{filePath}</span>}
        {bashCommand && <span className="font-mono text-text-secondary text-xs truncate max-w-[300px]">$ {bashCommand}</span>}
        {diffStatusBadge}
        {duration && <span className="text-text-secondary text-xs ml-auto">({duration}s)</span>}
        {toolCall.status === 'running' && (
          <span className="text-text-secondary text-xs animate-pulse ml-auto">running...</span>
        )}
      </div>

      {/* Inline accept/reject for pending staged diffs */}
      {stagedDiff && stagedDiff.status === 'pending' && (
        <div className="flex items-center gap-1.5 mt-2">
          <button
            onClick={handleAccept}
            className="flex items-center gap-1 px-2.5 py-1 bg-success/20 hover:bg-success/30 text-success rounded text-xs font-medium transition-colors"
          >
            ✓ Accept
          </button>
          <button
            onClick={handleAlwaysAccept}
            className="flex items-center gap-1 px-2.5 py-1 bg-warning/20 hover:bg-warning/30 text-warning rounded text-xs font-medium transition-colors"
            title={`Always accept ${toolCall.toolName} for this session`}
          >
            ⚡ Always
          </button>
          <button
            onClick={handleReject}
            className="flex items-center gap-1 px-2.5 py-1 bg-error/20 hover:bg-error/30 text-error rounded text-xs font-medium transition-colors"
          >
            ✕ Reject
          </button>
        </div>
      )}

      {/* Show auto-accepted badge */}
      {stagedDiff && stagedDiff.status === 'pending' && isToolAutoAccepted && (
        <span className="text-[10px] text-warning mt-1 inline-block">auto-accepting {toolCall.toolName}</span>
      )}
      
      {toolCall.result && toolCall.status === 'completed' && (
        <ToolResult toolCall={toolCall} />
      )}
    </div>
  );
}
