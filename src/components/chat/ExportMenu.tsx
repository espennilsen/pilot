/**
 * ExportMenu — Dropdown menu for exporting chat sessions.
 *
 * Provides options to export the current conversation to Markdown, JSON,
 * or copy to clipboard. Triggered from the ChatHeader.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, FileText, FileJson, Clipboard, Check } from 'lucide-react';
import { IPC } from '../../../shared/ipc';
import type { SessionExportOptions, SessionExportFormat, SessionExportResult } from '../../../shared/types';
import { useTabStore } from '../../stores/tab-store';

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const copiedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeTabId = useTabStore(s => s.activeTabId);
  const tabs = useTabStore(s => s.tabs);
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const doExport = useCallback(async (format: SessionExportFormat) => {
    if (!activeTabId) return;
    setError(null);
    const options: SessionExportOptions = {
      format,
      includeThinking: true,
      includeToolCalls: false,
      includeTimestamps: true,
    };
    const meta = {
      title: activeTab?.title || 'Chat Export',
      projectPath: activeTab?.projectPath || undefined,
    };
    try {
      await window.api.invoke(IPC.SESSION_EXPORT, activeTabId, options, meta);
      setOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [activeTabId, activeTab]);

  const doCopy = useCallback(async () => {
    if (!activeTabId) return;
    setError(null);
    const options: SessionExportOptions = {
      format: 'markdown',
      includeThinking: false,
      includeToolCalls: false,
      includeTimestamps: true,
    };
    const meta = {
      title: activeTab?.title || 'Chat Export',
      projectPath: activeTab?.projectPath || undefined,
    };
    try {
      await window.api.invoke(IPC.SESSION_EXPORT_CLIPBOARD, activeTabId, options, meta);
      setCopied(true);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
      setOpen(false);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      setError(err instanceof Error ? err.message : 'Copy to clipboard failed');
    }
  }, [activeTabId, activeTab]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => { if (!open) setError(null); setOpen(!open); }}
        className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
        aria-label="Export conversation"
        title="Export conversation"
      >
        {copied ? (
          <Check className="w-4 h-4 text-success" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          <button
            onClick={() => doExport('markdown')}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-bg-surface transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-primary">Export as Markdown</span>
          </button>
          <button
            onClick={() => doExport('json')}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-bg-surface transition-colors text-left"
          >
            <FileJson className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-primary">Export as JSON</span>
          </button>
          <div className="my-1 border-t border-border" />
          <button
            onClick={doCopy}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-bg-surface transition-colors text-left"
          >
            <Clipboard className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-primary">Copy to clipboard</span>
          </button>
          {error && (
            <>
              <div className="my-1 border-t border-border" />
              <div className="px-3 py-2 text-xs text-error">
                {error}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
