import { useEffect, useRef } from 'react';
import { useTunnelOutputStore, tunnelIdToProvider } from '../../stores/tunnel-output-store';

interface TunnelOutputProps {
  tunnelId: string;
}

export function TunnelOutput({ tunnelId }: TunnelOutputProps) {
  const { output } = useTunnelOutputStore();
  const provider = tunnelIdToProvider(tunnelId);
  const text = provider ? output[provider] : '';
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-hidden">
      <div
        ref={outputRef}
        className="font-mono text-xs text-text-primary p-2 flex-1 overflow-y-auto whitespace-pre-wrap"
      >
        {text || 'No output yet…'}
      </div>
    </div>
  );
}
