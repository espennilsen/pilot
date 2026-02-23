import { useOutputWindowStore } from '../../stores/output-window-store';
import { OutputWindow } from './OutputWindow';
import { useEffect, useState } from 'react';

export function OutputWindowManager() {
  const { windows, draggedTab, detachTab, setDraggedTab } = useOutputWindowStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dropPosition, setDropPosition] = useState<{ x: number; y: number } | null>(null);

  const windowList = Object.values(windows);

  // Track global drag state for drop overlay
  useEffect(() => {
    if (!draggedTab) {
      setIsDragging(false);
      setDropPosition(null);
      return;
    }

    setIsDragging(true);

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDropPosition({ x: e.clientX, y: e.clientY });
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();

      // Check if drop was on a window (let window handle it)
      const target = e.target as HTMLElement;
      if (target.closest('[data-output-window]')) {
        setDraggedTab(null);
        setIsDragging(false);
        setDropPosition(null);
        return;
      }

      // Drop outside any window - detach to new window
      if (draggedTab) {
        detachTab(draggedTab.windowId, draggedTab.commandId, {
          x: e.clientX - 250,
          y: e.clientY - 20,
        });
      }

      setDraggedTab(null);
      setIsDragging(false);
      setDropPosition(null);
    };

    const handleDragEnd = () => {
      setDraggedTab(null);
      setIsDragging(false);
      setDropPosition(null);
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, [draggedTab, detachTab, setDraggedTab]);

  return (
    <>
      {windowList.map((window) => (
        <div key={window.id} data-output-window>
          <OutputWindow window={window} />
        </div>
      ))}

      {/* Global drop overlay - shows drop indicator */}
      {isDragging && (
        <div className="fixed inset-0 z-30 pointer-events-none">
          <div className="absolute inset-0 bg-accent/5" />
          {dropPosition && (
            <div
              className="absolute w-64 h-32 border-2 border-dashed border-accent/50 rounded-lg bg-accent/10"
              style={{
                left: `${dropPosition.x - 128}px`,
                top: `${dropPosition.y - 16}px`,
              }}
            >
              <div className="flex items-center justify-center h-full text-xs text-accent">
                Drop to create new window
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
