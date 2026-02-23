import { YoloIndicator } from '../sandbox/YoloIndicator';
import { JailIndicator } from '../sandbox/JailIndicator';

interface ChatHeaderProps {
  isStreaming: boolean;
}

export default function ChatHeader({ isStreaming }: ChatHeaderProps) {
  return (
    <div className="h-10 bg-bg-surface border-b border-border flex items-center justify-between px-4">
      <div className="flex-1">
        {/* Session title will go here later */}
      </div>
      
      <div className="flex items-center gap-2">
        {/* Sandbox indicators */}
        <YoloIndicator />
        <JailIndicator />
        
        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-1 text-accent text-xs">
            <span className="animate-pulse">●</span>
            <span>streaming</span>
          </div>
        )}
      </div>
    </div>
  );
}
