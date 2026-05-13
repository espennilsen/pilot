import { YoloIndicator } from '../sandbox/YoloIndicator';
import { JailIndicator } from '../sandbox/JailIndicator';
import ExportMenu from './ExportMenu';
import { useSplitPaneStore } from '../../stores/split-pane-store';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';

interface ChatHeaderProps {
  isStreaming: boolean;
}

function SplitButtons() {
  const { split, layout, unsplit } = useSplitPaneStore();

  if (layout.mode === 'single') {
    return (
      <>
        <Tooltip content="Split Vertically" position="bottom">
          <button onClick={() => split('vertical')}
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split vertically">
            <Icon name="Columns" size={15} className="text-text-secondary" />
          </button>
        </Tooltip>
        <Tooltip content="Split Horizontally" position="bottom">
          <button onClick={() => split('horizontal')}
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split horizontally">
            <Icon name="Rows" size={15} className="text-text-secondary" />
          </button>
        </Tooltip>
      </>
    );
  }

  return (
    <Tooltip content="Close Split" position="bottom">
      <button onClick={() => unsplit()}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-bg-elevated transition-colors text-accent"
        aria-label="Close split">
        <Icon name="Combine" size={15} />
      </button>
    </Tooltip>
  );
}

export default function ChatHeader({ isStreaming }: ChatHeaderProps) {
  return (
    <div className="h-10 bg-bg-surface border-b border-border flex items-center justify-between px-4">
      <div className="flex-1">
        {/* Session title will go here later */}
      </div>
      
      <div className="flex items-center gap-2">
        {/* Split buttons */}
        <SplitButtons />

        {/* Export */}
        <ExportMenu />

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
