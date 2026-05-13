import { useEffect, useRef, useState } from 'react';
import { useTerminalSplitStore } from '../../stores/terminal-split-store';
import { useUIStore } from '../../stores/ui-store';
import { useProjectStore } from '../../stores/project-store';
import { SplitContainer } from '../shared/SplitContainer';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getXtermTheme } from './theme';
import { IPC } from '../../../shared/ipc';
import { invoke, on, send } from '../../lib/ipc-client';
import { Icon } from '../shared/Icon';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useThemeStore } from '../../stores/theme-store';

interface TermInstance {
  xterm: XTerm;
  fitAddon: FitAddon;
  unsubOutput: () => void;
  disposable: { dispose: () => void };
  initialized: boolean;
}

function TerminalPane({ terminalId, isFocused, onFitTrigger }: {
  terminalId: string | null;
  isFocused: boolean;
  onFitTrigger: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<TermInstance | null>(null);
  const projectPath = useProjectStore(s => s.projectPath);

  useEffect(() => {
    if (!terminalId || !containerRef.current || instanceRef.current) return;
    const cwd = projectPath || '~';
    const xterm = new XTerm({
      cursorBlink: true, fontSize: 14,
      fontFamily: 'Menlo, Monaco, Consolas, "DejaVu Sans Mono", monospace',
      theme: getXtermTheme(), scrollback: 5000, allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(containerRef.current);

    const unsubOutput = on(IPC.TERMINAL_OUTPUT, (p: { id: string; data: string }) => {
      if (p.id === terminalId) xterm.write(p.data);
    });
    const disposable = xterm.onData((data) => send(IPC.TERMINAL_DATA, terminalId, data));

    const inst: TermInstance = { xterm, fitAddon, unsubOutput, disposable, initialized: false };
    instanceRef.current = inst;

    requestAnimationFrame(() => {
      if (instanceRef.current !== inst) return;
      try {
        fitAddon.fit();
        invoke(IPC.TERMINAL_CREATE, terminalId, cwd).then(() => {
          invoke(IPC.TERMINAL_RESIZE, terminalId, xterm.cols, xterm.rows);
          inst.initialized = true;
        });
      } catch (e) { console.error('Terminal init failed:', e); }
    });

    return () => {
      inst.unsubOutput(); inst.disposable.dispose();
      invoke(IPC.TERMINAL_DISPOSE, terminalId).catch(() => {});
      xterm.dispose(); instanceRef.current = null;
    };
  }, [terminalId, projectPath]);

  // Re-fit on resize or focus change
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst?.initialized || !terminalId) return;
    requestAnimationFrame(() => {
      try {
        inst.fitAddon.fit();
        invoke(IPC.TERMINAL_RESIZE, terminalId, inst.xterm.cols, inst.xterm.rows);
        if (isFocused) inst.xterm.focus();
      } catch { /* ignore */ }
    });
  }, [onFitTrigger, isFocused, terminalId]);

  // Theme updates
  const theme = useAppSettingsStore(s => s.theme);
  const activeCustomTheme = useThemeStore(s => s.activeCustomTheme);
  useEffect(() => {
    if (instanceRef.current) instanceRef.current.xterm.options.theme = getXtermTheme();
  }, [theme, activeCustomTheme]);

  if (!terminalId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <p className="text-sm">No terminal in this pane</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex-1 overflow-hidden ${isFocused ? '' : 'opacity-75'}`}
      onClick={() => useUIStore.getState().setActiveTerminal(terminalId)} />
  );
}

export default function TerminalSplitView() {
  const layout = useTerminalSplitStore(s => s.layout);
  const { unsplit, setSplitRatio, getPaneTerminalIds } = useTerminalSplitStore();
  const activeTerminalId = useUIStore(s => s.activeTerminalId);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [primaryId, secondaryId] = getPaneTerminalIds();

  return (
    <div className="flex-1 flex overflow-hidden relative">
      <SplitContainer
        direction={layout.direction}
        ratio={layout.splitRatio}
        onRatioChange={setSplitRatio}
        firstChild={<TerminalPane terminalId={primaryId} isFocused={activeTerminalId === primaryId} onFitTrigger={fitTrigger} />}
        secondChild={<TerminalPane terminalId={secondaryId} isFocused={activeTerminalId === secondaryId} onFitTrigger={fitTrigger} />}
      />
      <button onClick={() => { unsplit(); setFitTrigger(n => n + 1); }}
        className="absolute top-1 right-1 z-20 p-0.5 rounded bg-bg-surface/80 border border-border hover:bg-bg-elevated transition-colors"
        aria-label="Close split">
        <Icon name="X" size={12} className="text-text-secondary" />
      </button>
    </div>
  );
}
