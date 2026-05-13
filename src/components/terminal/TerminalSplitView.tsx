import { useEffect, useRef, useState } from 'react';
import { useTerminalSplitStore, type SplitNode } from '../../stores/terminal-split-store';
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
import { Tooltip } from '../shared/Tooltip';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useThemeStore } from '../../stores/theme-store';

interface TermInstance {
  xterm: XTerm;
  fitAddon: FitAddon;
  unsubOutput: () => void;
  disposable: { dispose: () => void };
  initialized: boolean;
}

function TerminalPaneContent({ node }: { node: SplitNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<TermInstance | null>(null);
  const projectPath = useProjectStore(s => s.projectPath);
  const [fitTrigger, setFitTrigger] = useState(0);
  const { splitPane, closePane, setPaneTerminalId } = useTerminalSplitStore();
  const leaves = useTerminalSplitStore(s => s.getLeaves());
  const isOnlyLeaf = leaves.length <= 1;
  const activeTerminalId = useUIStore(s => s.activeTerminalId);
  const terminalTabs = useUIStore(s => s.terminalTabs);

  useEffect(() => {
    if (!node.terminalId || !containerRef.current || instanceRef.current) return;
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
      if (p.id === node.terminalId) xterm.write(p.data);
    });
    const disposable = xterm.onData((data) => send(IPC.TERMINAL_DATA, node.terminalId, data));

    const inst: TermInstance = { xterm, fitAddon, unsubOutput, disposable, initialized: false };
    instanceRef.current = inst;

    requestAnimationFrame(() => {
      if (instanceRef.current !== inst) return;
      try {
        fitAddon.fit();
        invoke(IPC.TERMINAL_CREATE, node.terminalId, cwd).then(() => {
          invoke(IPC.TERMINAL_RESIZE, node.terminalId, xterm.cols, xterm.rows);
          inst.initialized = true;
        });
      } catch (e) { console.error('Terminal init failed:', e); }
    });

    return () => {
      inst.unsubOutput(); inst.disposable.dispose();
      invoke(IPC.TERMINAL_DISPOSE, node.terminalId).catch(() => {});
      xterm.dispose(); instanceRef.current = null;
    };
  }, [node.terminalId, projectPath]);

  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst?.initialized || !node.terminalId) return;
    requestAnimationFrame(() => {
      try {
        inst.fitAddon.fit();
        invoke(IPC.TERMINAL_RESIZE, node.terminalId, inst.xterm.cols, inst.xterm.rows);
        if (activeTerminalId === node.terminalId) inst.xterm.focus();
      } catch { /* ignore */ }
    });
  }, [fitTrigger, activeTerminalId, node.terminalId]);

  const theme = useAppSettingsStore(s => s.theme);
  const activeCustomTheme = useThemeStore(s => s.activeCustomTheme);
  useEffect(() => {
    if (instanceRef.current) instanceRef.current.xterm.options.theme = getXtermTheme();
  }, [theme, activeCustomTheme]);

  if (!node.terminalId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <p className="text-sm">No terminal in this pane</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative group/pane">
      {/* Toolbar */}
      <div className={`
        absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded bg-bg-surface/90 border border-border
        transition-opacity
        ${activeTerminalId === node.terminalId ? 'opacity-100' : 'opacity-0 group-hover/pane:opacity-100'}
      `}>
        <Tooltip content="Split Vertically" position="bottom">
          <button onClick={() => splitPane(node.id, 'vertical')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split vertically">
            <Icon name="Columns" size={13} className="text-text-secondary" />
          </button>
        </Tooltip>
        <Tooltip content="Split Horizontally" position="bottom">
          <button onClick={() => splitPane(node.id, 'horizontal')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split horizontally">
            <Icon name="Rows" size={13} className="text-text-secondary" />
          </button>
        </Tooltip>
        {!isOnlyLeaf && (
          <Tooltip content="Close Pane" position="bottom">
            <button onClick={() => closePane(node.id)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-error/20 text-text-secondary hover:text-error transition-colors"
              aria-label="Close pane">
              <Icon name="X" size={13} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Terminal tab selector */}
      {terminalTabs.length > 1 && (
        <div className="absolute top-1 left-1 z-10">
          <select
            value={node.terminalId ?? ''}
            onChange={(e) => setPaneTerminalId(node.id, e.target.value || null)}
            className="text-xs bg-bg-surface/90 border border-border rounded px-1.5 py-0.5 text-text-secondary"
          >
            {terminalTabs.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-hidden"
        onClick={() => node.terminalId && useUIStore.getState().setActiveTerminal(node.terminalId)} />
    </div>
  );
}

function isValidNode(node: unknown): node is SplitNode {
  if (!node || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  if (n.type !== 'leaf' && n.type !== 'split') return false;
  if (typeof n.id !== 'string') return false;
  if (n.type === 'split') {
    if (!n.first || !n.second) return false;
    if (typeof n.ratio !== 'number') return false;
  }
  return true;
}

function TerminalNodeView({ node }: { node: SplitNode }) {
  const { setRatio } = useTerminalSplitStore();

  if (node.type === 'leaf') {
    return <TerminalPaneContent node={node} />;
  }

  return (
    <SplitContainer
      direction={node.direction!}
      ratio={node.ratio ?? 0.5}
      onRatioChange={(ratio) => setRatio(node.id, ratio)}
      firstChild={<TerminalNodeView node={node.first!} />}
      secondChild={<TerminalNodeView node={node.second!} />}
    />
  );
}

export default function TerminalSplitView() {
  const root = useTerminalSplitStore(s => s.root);
  const { init, reset } = useTerminalSplitStore();
  const didInitRef = useRef(false);

  // Validate and initialise on mount — never call setState during render
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!isValidNode(root)) {
      if (root) reset();
      init();
    }
  }, [root, init, reset]);

  if (!isValidNode(root)) return null;

  return <TerminalNodeView node={root} />;
}
