import { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  side: 'left' | 'right';
}

export function ResizeHandle({ onResize, side }: ResizeHandleProps) {
  const startXRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      startXRef.current = moveEvent.clientX;
      
      // For left side, positive delta means expanding to the right
      // For right side, negative delta means expanding to the left
      const adjustedDelta = side === 'left' ? -delta : delta;
      onResize(adjustedDelta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, side]);

  return (
    <div
      className="w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
      onMouseDown={handleMouseDown}
    />
  );
}
