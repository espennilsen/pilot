/**
 * ArtifactPanel — Side panel for rendering live artifacts.
 *
 * Displays the active artifact in a sandboxed iframe. Supports HTML,
 * SVG, and Mermaid content. Includes tabs for switching between
 * multiple artifacts and a source/preview toggle.
 */

import { useState, useMemo } from 'react';
import { X, Code, Eye, Layers, RefreshCw } from 'lucide-react';
import { useTabStore } from '../../stores/tab-store';
import { useArtifactStore } from '../../stores/artifact-store';
import ArtifactRenderer from './ArtifactRenderer';

export default function ArtifactPanel() {
  const activeTabId = useTabStore(s => s.activeTabId);
  const { panelVisible, hidePanel, setActiveArtifact, removeArtifact } = useArtifactStore();
  const artifactsByTab = useArtifactStore(s => s.artifactsByTab);
  const activeArtifactByTab = useArtifactStore(s => s.activeArtifactByTab);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [refreshKey, setRefreshKey] = useState(0);

  const artifacts = useMemo(() => activeTabId ? artifactsByTab[activeTabId] || [] : [], [activeTabId, artifactsByTab]);
  const activeArtifact = useMemo(() => {
    if (!activeTabId) return null;
    const list = artifactsByTab[activeTabId] || [];
    const activeId = activeArtifactByTab[activeTabId];
    return list.find(a => a.id === activeId) || null;
  }, [activeTabId, artifactsByTab, activeArtifactByTab]);

  if (!panelVisible || !activeTabId || artifacts.length === 0) return null;

  return (
    <div className="w-[480px] min-w-[320px] border-l border-border bg-bg-base flex flex-col">
      {/* Header */}
      <div className="h-10 bg-bg-surface border-b border-border flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary truncate max-w-[200px]">
            {activeArtifact?.title || 'Artifact'}
          </span>
          {activeArtifact && (
            <span className="text-[10px] text-text-secondary bg-bg-elevated px-1.5 py-0.5 rounded">
              v{activeArtifact.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'preview' ? 'source' : 'preview')}
            className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
            title={viewMode === 'preview' ? 'View source' : 'View preview'}
          >
            {viewMode === 'preview' ? <Code className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          {/* Refresh */}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {/* Close */}
          <button
            onClick={hidePanel}
            className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
            title="Close artifact panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Artifact tabs (if multiple) */}
      {artifacts.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-bg-surface border-b border-border overflow-x-auto">
          {artifacts.map(a => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveArtifact(activeTabId!, a.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveArtifact(activeTabId!, a.id); } }}
              className={`
                flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors cursor-pointer
                ${a.id === activeArtifact?.id
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'}
              `}
            >
              <span className="truncate max-w-[120px]">{a.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeArtifact(activeTabId!, a.id); }}
                className="hover:text-error ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeArtifact && viewMode === 'preview' && (
          <ArtifactRenderer
            key={`${activeArtifact.id}-${activeArtifact.version}-${refreshKey}`}
            artifact={activeArtifact}
          />
        )}
        {activeArtifact && viewMode === 'source' && (
          <pre className="p-4 text-xs text-text-primary font-mono whitespace-pre-wrap break-words">
            {activeArtifact.source}
          </pre>
        )}
      </div>
    </div>
  );
}
