/**
 * Tests for artifact-store.ts — artifact management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useArtifactStore } from '../../../src/stores/artifact-store';

describe('useArtifactStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useArtifactStore.setState({
      artifactsByTab: {},
      activeArtifactByTab: {},
      panelVisible: false,
    });
  });

  it('should create an artifact and set it as active', () => {
    const store = useArtifactStore.getState();
    const artifact = store.createArtifact('tab-1', 'html', '<h1>Hello</h1>');

    expect(artifact.id).toBeTruthy();
    expect(artifact.type).toBe('html');
    expect(artifact.source).toBe('<h1>Hello</h1>');
    expect(artifact.title).toBe('HTML Preview');
    expect(artifact.version).toBe(1);

    const state = useArtifactStore.getState();
    expect(state.artifactsByTab['tab-1']).toHaveLength(1);
    expect(state.activeArtifactByTab['tab-1']).toBe(artifact.id);
    expect(state.panelVisible).toBe(true);
  });

  it('should extract title from HTML <title> tag', () => {
    const store = useArtifactStore.getState();
    const artifact = store.createArtifact('tab-1', 'html', '<title>My Page</title><body>Hi</body>');
    expect(artifact.title).toBe('My Page');
  });

  it('should extract component name from React', () => {
    const store = useArtifactStore.getState();
    const artifact = store.createArtifact('tab-1', 'react', 'function MyComponent() { return <div/>; }');
    expect(artifact.title).toBe('MyComponent');
  });

  it('should use custom title when provided', () => {
    const store = useArtifactStore.getState();
    const artifact = store.createArtifact('tab-1', 'html', '<p>test</p>', 'Custom Title');
    expect(artifact.title).toBe('Custom Title');
  });

  it('should update an artifact and increment version', () => {
    const store = useArtifactStore.getState();
    const artifact = store.createArtifact('tab-1', 'html', '<p>v1</p>');
    
    store.updateArtifact('tab-1', artifact.id, '<p>v2</p>');
    
    const updated = useArtifactStore.getState().getActiveArtifact('tab-1');
    expect(updated?.source).toBe('<p>v2</p>');
    expect(updated?.version).toBe(2);
  });

  it('should remove an artifact', () => {
    const store = useArtifactStore.getState();
    const a1 = store.createArtifact('tab-1', 'html', '<p>1</p>');
    const a2 = store.createArtifact('tab-1', 'svg', '<svg/>');

    store.removeArtifact('tab-1', a1.id);

    const state = useArtifactStore.getState();
    expect(state.artifactsByTab['tab-1']).toHaveLength(1);
    expect(state.activeArtifactByTab['tab-1']).toBe(a2.id);
  });

  it('should hide panel when last artifact is removed', () => {
    const store = useArtifactStore.getState();
    const artifact = store.createArtifact('tab-1', 'html', '<p>test</p>');
    expect(useArtifactStore.getState().panelVisible).toBe(true);

    store.removeArtifact('tab-1', artifact.id);
    expect(useArtifactStore.getState().panelVisible).toBe(false);
  });

  it('should set active artifact', () => {
    const store = useArtifactStore.getState();
    const a1 = store.createArtifact('tab-1', 'html', '<p>1</p>');
    const a2 = store.createArtifact('tab-1', 'html', '<p>2</p>');

    // a2 is active after creation
    expect(useArtifactStore.getState().activeArtifactByTab['tab-1']).toBe(a2.id);

    store.setActiveArtifact('tab-1', a1.id);
    expect(useArtifactStore.getState().activeArtifactByTab['tab-1']).toBe(a1.id);
  });

  it('should toggle panel visibility', () => {
    const store = useArtifactStore.getState();
    expect(store.panelVisible).toBe(false);
    
    store.togglePanel();
    expect(useArtifactStore.getState().panelVisible).toBe(true);
    
    store.togglePanel();
    expect(useArtifactStore.getState().panelVisible).toBe(false);
  });

  it('should clear all artifacts for a tab', () => {
    const store = useArtifactStore.getState();
    store.createArtifact('tab-1', 'html', '<p>1</p>');
    store.createArtifact('tab-1', 'html', '<p>2</p>');

    store.clearTab('tab-1');

    const state = useArtifactStore.getState();
    expect(state.artifactsByTab['tab-1']).toBeUndefined();
    expect(state.activeArtifactByTab['tab-1']).toBeUndefined();
  });

  it('should get artifacts for a tab', () => {
    const store = useArtifactStore.getState();
    store.createArtifact('tab-1', 'html', '<p>1</p>');
    store.createArtifact('tab-1', 'svg', '<svg/>');

    expect(store.getArtifacts('tab-1')).toHaveLength(2);
    expect(store.getArtifacts('tab-2')).toHaveLength(0);
  });

  it('should handle default titles for all types', () => {
    const store = useArtifactStore.getState();
    
    expect(store.createArtifact('t', 'html', '<p>x</p>').title).toBe('HTML Preview');
    expect(store.createArtifact('t', 'svg', '<svg/>').title).toBe('SVG Image');
    expect(store.createArtifact('t', 'mermaid', 'graph TD\nA-->B').title).toBe('Mermaid Diagram');
    expect(store.createArtifact('t', 'react', 'export default () => null').title).toBe('React Component');
  });
});
