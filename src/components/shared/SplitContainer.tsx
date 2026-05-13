import { useCallback, useEffect, useRef } from 'react';

export type SplitDirection = 'horizontal' | 'vertical';

interface SplitContainerProps {
  direction: SplitDirection;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  firstChild: React.ReactNode;
  secondChild: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  handleSize?: number;
}

export function SplitContainer({
  direction, ratio, onRatioChange,
  firstChild, secondChild,
  containerRef: externalRef, handleSize = 6,
}: SplitContainerProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef ?? internalRef;
  const dragRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    const start = direction === 'vertical' ? e.clientX : e.clientY;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const pos = direction === 'vertical' ? ev.clientX : ev.clientY;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const total = direction === 'vertical' ? rect.width : rect.height;
      onRatioChange(Math.max(0.15, Math.min(0.85, ratio + (pos - start) / total)));
    };

    const onUp = () => {
      dragRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [direction, ratio, onRatioChange, containerRef]);

  useEffect(() => () => { document.body.style.cursor = ''; document.body.style.userSelect = ''; }, []);

  const flexDir = direction === 'vertical' ? 'flex-row' : 'flex-col';
  const handleCls = direction === 'vertical'
    ? 'w-1.5 cursor-col-resize hover:bg-accent/40 active:bg-accent/60'
    : 'h-1.5 cursor-row-resize hover:bg-accent/40 active:bg-accent/60';

  return (
    <div ref={containerRef} className={`flex-1 flex ${flexDir} overflow-hidden`}>
      <div className="flex flex-col overflow-hidden"
        style={{ flex: `0 0 ${ratio * 100}%`, minWidth: 0, minHeight: 0 }}>
        {firstChild}
      </div>
      <div className={`relative z-10 flex-shrink-0 flex items-center justify-center transition-colors ${handleCls}`}
        style={{ width: direction === 'vertical' ? handleSize : undefined, height: direction === 'horizontal' ? handleSize : undefined }}
        onMouseDown={onMouseDown}>
        <div className="absolute bg-accent/20 rounded-full"
          style={{ width: direction === 'vertical' ? 3 : '60%', height: direction === 'horizontal' ? 3 : undefined }} />
      </div>
      <div className="flex flex-col overflow-hidden"
        style={{ flex: `0 0 ${(1 - ratio) * 100}%`, minWidth: 0, minHeight: 0 }}>
        {secondChild}
      </div>
    </div>
  );
}
