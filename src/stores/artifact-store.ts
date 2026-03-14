/**
 * Artifact store — manages live preview artifacts per tab.
 *
 * Artifacts are rendered HTML/SVG/Mermaid/React content created from
 * code blocks in chat messages. Each tab can have multiple artifacts
 * with one active artifact displayed in the preview panel.
 */

import { create } from 'zustand';
import type { Artifact, ArtifactType } from '../../shared/types';

interface ArtifactStore {
  /** All artifacts by tab ID. */
  artifactsByTab: Record<string, Artifact[]>;
  /** Currently active artifact ID per tab. */
  activeArtifactByTab: Record<string, string | null>;
  /** Whether the artifact panel is visible. */
  panelVisible: boolean;

  /** Create a new artifact and make it active. */
  createArtifact: (tabId: string, type: ArtifactType, source: string, title?: string) => Artifact;
  /** Update an existing artifact's source. */
  updateArtifact: (tabId: string, artifactId: string, source: string) => void;
  /** Remove an artifact. */
  removeArtifact: (tabId: string, artifactId: string) => void;
  /** Set the active artifact for a tab. */
  setActiveArtifact: (tabId: string, artifactId: string | null) => void;
  /** Toggle panel visibility. */
  togglePanel: () => void;
  /** Show panel. */
  showPanel: () => void;
  /** Hide panel. */
  hidePanel: () => void;
  /** Get artifacts for a tab. */
  getArtifacts: (tabId: string) => Artifact[];
  /** Get the active artifact for a tab. */
  getActiveArtifact: (tabId: string) => Artifact | null;
  /** Clear all artifacts for a tab. */
  clearTab: (tabId: string) => void;
}

/** Generate a default title from content type and source. */
function generateTitle(type: ArtifactType, source: string): string {
  // Try to extract a <title> from HTML
  if (type === 'html') {
    const match = source.match(/<title>(.*?)<\/title>/i);
    if (match) return match[1];
  }
  // Try to extract component name from React
  if (type === 'react') {
    const match = source.match(/(?:function|const)\s+(\w+)/);
    if (match) return match[1];
  }
  // Default titles by type
  const defaults: Record<ArtifactType, string> = {
    html: 'HTML Preview',
    react: 'React Component',
    svg: 'SVG Image',
    mermaid: 'Mermaid Diagram',
  };
  return defaults[type];
}

export const useArtifactStore = create<ArtifactStore>((set, get) => ({
  artifactsByTab: {},
  activeArtifactByTab: {},
  panelVisible: false,

  createArtifact: (tabId, type, source, title) => {
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      title: title || generateTitle(type, source),
      type,
      source,
      tabId,
      createdAt: Date.now(),
      version: 1,
    };

    set(state => ({
      artifactsByTab: {
        ...state.artifactsByTab,
        [tabId]: [...(state.artifactsByTab[tabId] || []), artifact],
      },
      activeArtifactByTab: {
        ...state.activeArtifactByTab,
        [tabId]: artifact.id,
      },
      panelVisible: true,
    }));

    return artifact;
  },

  updateArtifact: (tabId, artifactId, source) => {
    set(state => ({
      artifactsByTab: {
        ...state.artifactsByTab,
        [tabId]: (state.artifactsByTab[tabId] || []).map(a =>
          a.id === artifactId
            ? { ...a, source, version: a.version + 1 }
            : a
        ),
      },
    }));
  },

  removeArtifact: (tabId, artifactId) => {
    set(state => {
      const artifacts = (state.artifactsByTab[tabId] || []).filter(a => a.id !== artifactId);
      const activeId = state.activeArtifactByTab[tabId];
      return {
        artifactsByTab: { ...state.artifactsByTab, [tabId]: artifacts },
        activeArtifactByTab: {
          ...state.activeArtifactByTab,
          [tabId]: activeId === artifactId
            ? (artifacts[0]?.id ?? null)
            : activeId,
        },
        panelVisible: artifacts.length > 0 ? state.panelVisible : false,
      };
    });
  },

  setActiveArtifact: (tabId, artifactId) => {
    set(state => ({
      activeArtifactByTab: { ...state.activeArtifactByTab, [tabId]: artifactId },
    }));
  },

  togglePanel: () => set(state => ({ panelVisible: !state.panelVisible })),
  showPanel: () => set({ panelVisible: true }),
  hidePanel: () => set({ panelVisible: false }),

  getArtifacts: (tabId) => get().artifactsByTab[tabId] || [],

  getActiveArtifact: (tabId) => {
    const artifacts = get().artifactsByTab[tabId] || [];
    const activeId = get().activeArtifactByTab[tabId];
    return artifacts.find(a => a.id === activeId) || null;
  },

  clearTab: (tabId) => {
    set(state => {
      const newArtifacts = { ...state.artifactsByTab };
      delete newArtifacts[tabId];
      const newActive = { ...state.activeArtifactByTab };
      delete newActive[tabId];
      return { artifactsByTab: newArtifacts, activeArtifactByTab: newActive };
    });
  },
}));
