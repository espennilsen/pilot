import { useState } from 'react';
import { ChatMessage, ToolCallInfo } from '../../stores/chat-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { useTabStore } from '../../stores/tab-store';
import { renderMarkdown } from '../../lib/markdown';
import { ToolResult } from './ToolResult';
import StreamingCursor from './StreamingCursor';

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return <UserMessage message={message} />;
  }
  return <AssistantMessage message={message} />;
}

function UserMessage({ message }: MessageBubbleProps) {
  return (
    <div className="border-l-2 border-accent pl-4 py-2">
      <div className="text-text-primary whitespace-pre-wrap">{message.content}</div>
    </div>
  );
}

function AssistantMessage({ message }: MessageBubbleProps) {
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
    <div className="py-2">
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
        {message.content && renderMarkdown(message.content)}
        {message.isStreaming && <StreamingCursor />}
      </div>
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
