import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useUIStore } from '../../stores/ui-store';
import { useProjectStore } from '../../stores/project-store';
import { IPC } from '../../../shared/ipc';
import { invoke, on, send } from '../../lib/ipc-client';
import { X, Plus, Terminal as TerminalIcon } from 'lucide-react';

const XTERM_THEME = {
  background: '#1a1b1e',
  foreground: '#e0e0e0',
  cursor: '#4fc3f7',
  selectionBackground: '#4fc3f740',
  black: '#1a1b1e',
  red: '#ef5350',
  green: '#66bb6a',
  yellow: '#ffa726',
  blue: '#4fc3f7',
  magenta: '#ce93d8',
  cyan: '#4dd0e1',
  white: '#e0e0e0',
  brightBlack: '#5a5a5a',
  brightRed: '#ff5252',
  brightGreen: '#69f0ae',
  brightYellow: '#ffd740',
  brightBlue: '#40c4ff',
  brightMagenta: '#ea80fc',
  brightCyan: '#64ffda',
  brightWhite: '#ffffff',
};

interface TermInstance {
  xterm: XTerm;
  fitAddon: FitAddon;
  unsubOutput: () => void;
  disposable: { dispose: () => void };
  initialized: boolean;
}

export default function Terminal() {
  const {
    terminalVisible, terminalHeight, setTerminalHeight, toggleTerminal,
    terminalTabs, activeTerminalId, addTerminalTab, closeTerminalTab, setActiveTerminal,
  } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Create or attach xterm for a given tab
  const initTerminal = useCallback((tabId: string) => {
    if (instancesRef.current.has(tabId) || !containerRef.current) return;

    const cwd = useProjectStore.getState().projectPath || '~';

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace',
      theme: XTERM_THEME,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());

    // Create an off-screen container to hold xterm — we swap visibility via display
    const el = document.createElement('div');
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'none';
    el.dataset.terminalId = tabId;
    containerRef.current.appendChild(el);

    xterm.open(el);

    // Listen for PTY output routed to this terminal
    const unsubOutput = on(IPC.TERMINAL_OUTPUT, (payload: { id: string; data: string }) => {
      if (payload.id === tabId) {
        xterm.write(payload.data);
      }
    });

    // Send user input to the right PTY
    const disposable = xterm.onData((data) => {
      send(IPC.TERMINAL_DATA, tabId, data);
    });

    const instance: TermInstance = { xterm, fitAddon, unsubOutput, disposable, initialized: false };
    instancesRef.current.set(tabId, instance);

    // Spawn PTY after first fit
    requestAnimationFrame(() => {
      // Guard: if this instance was destroyed/replaced (e.g. StrictMode remount), skip
      if (instancesRef.current.get(tabId) !== instance) return;

      el.style.display = 'block';
      try {
        fitAddon.fit();
        const { cols, rows } = xterm;
        invoke(IPC.TERMINAL_CREATE, tabId, cwd).then(() => {
          invoke(IPC.TERMINAL_RESIZE, tabId, cols, rows);
          instance.initialized = true;
        });
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
      }
      // Hide again if not active
      if (useUIStore.getState().activeTerminalId !== tabId) {
        el.style.display = 'none';
      }
    });
  }, []);

  // Destroy a single terminal instance
  const destroyTerminal = useCallback((tabId: string) => {
    const instance = instancesRef.current.get(tabId);
    if (!instance) return;
    instance.unsubOutput();
    instance.disposable.dispose();
    invoke(IPC.TERMINAL_DISPOSE, tabId);
    instance.xterm.dispose();
    // Remove DOM element
    const el = containerRef.current?.querySelector(`[data-terminal-id="${tabId}"]`);
    el?.remove();
    instancesRef.current.delete(tabId);
  }, []);

  // Init terminals for new tabs
  useEffect(() => {
    for (const tab of terminalTabs) {
      if (!instancesRef.current.has(tab.id)) {
        initTerminal(tab.id);
      }
    }
    // Clean up removed tabs
    for (const [id] of instancesRef.current) {
      if (!terminalTabs.find(t => t.id === id)) {
        destroyTerminal(id);
      }
    }
  }, [terminalTabs, initTerminal, destroyTerminal]);

  // Switch visible xterm when active tab changes
  useEffect(() => {
    if (!containerRef.current) return;
    for (const [id, instance] of instancesRef.current) {
      const el = containerRef.current.querySelector(`[data-terminal-id="${id}"]`) as HTMLElement | null;
      if (!el) continue;
      if (id === activeTerminalId) {
        el.style.display = 'block';
        requestAnimationFrame(() => {
          try {
            instance.fitAddon.fit();
            if (instance.initialized) {
              const { cols, rows } = instance.xterm;
              invoke(IPC.TERMINAL_RESIZE, id, cols, rows);
            }
            instance.xterm.focus();
          } catch { /* ignore */ }
        });
      } else {
        el.style.display = 'none';
      }
    }
  }, [activeTerminalId]);

  // Resize observer: re-fit active terminal when container size changes
  useEffect(() => {
    if (!containerRef.current) return;
    resizeObserverRef.current = new ResizeObserver(() => {
      const id = useUIStore.getState().activeTerminalId;
      if (!id) return;
      const instance = instancesRef.current.get(id);
      if (!instance || !instance.initialized) return;
      try {
        instance.fitAddon.fit();
        const { cols, rows } = instance.xterm;
        invoke(IPC.TERMINAL_RESIZE, id, cols, rows);
      } catch { /* ignore */ }
    });
    resizeObserverRef.current.observe(containerRef.current);
    return () => resizeObserverRef.current?.disconnect();
  }, []);

  // Re-fit on height or visibility change
  useEffect(() => {
    if (!terminalVisible || !activeTerminalId) return;
    const instance = instancesRef.current.get(activeTerminalId);
    if (!instance || !instance.initialized) return;
    requestAnimationFrame(() => {
      try {
        instance.fitAddon.fit();
        const { cols, rows } = instance.xterm;
        invoke(IPC.TERMINAL_RESIZE, activeTerminalId, cols, rows);
        instance.xterm.focus();
      } catch { /* ignore */ }
    });
  }, [terminalHeight, terminalVisible, activeTerminalId]);

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    destroyTerminal(tabId);
    closeTerminalTab(tabId);
  };

  return (
    <div
      className="bg-bg-base border-t border-border flex flex-col"
      style={{ height: terminalVisible ? `${terminalHeight}px` : '0px', overflow: terminalVisible ? undefined : 'hidden' }}
    >
      {/* Resize handle */}
      <div
        className="h-1 bg-border hover:bg-accent cursor-ns-resize transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startHeight = terminalHeight;
          const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaY = startY - moveEvent.clientY;
            setTerminalHeight(startHeight + deltaY);
          };
          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
      />

      {/* Body: terminal content + tab sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Terminal content area */}
        <div
          ref={containerRef}
          className="flex-1 pl-2 pt-1"
          style={{ minHeight: 0, overflow: 'hidden' }}
        />

        {/* Tab sidebar on the right */}
        <div className="w-[140px] flex-shrink-0 bg-bg-surface border-l border-border flex flex-col">
          {/* New terminal button */}
          <button
            onClick={() => addTerminalTab()}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors border-b border-border"
            title="New Terminal"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Terminal</span>
          </button>

          {/* Tab list */}
          <div className="flex-1 overflow-y-auto">
            {terminalTabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTerminal(tab.id)}
                className={`flex items-center justify-between px-2 py-1.5 text-xs cursor-pointer transition-colors group ${
                  tab.id === activeTerminalId
                    ? 'bg-bg-elevated text-text-primary'
                    : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <TerminalIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{tab.name}</span>
                </div>
                <button
                  onClick={(e) => handleClose(e, tab.id)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-base transition-opacity"
                  title="Close terminal"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
