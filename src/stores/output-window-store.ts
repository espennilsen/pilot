import { create } from 'zustand';

export interface OutputWindow {
  id: string;
  commandIds: string[];  // tabs
  activeCommandId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface OutputWindowStore {
  windows: Record<string, OutputWindow>;
  draggedTab: { windowId: string; commandId: string } | null;
  
  openOutput: (commandId: string) => void;
  closeOutput: (windowId: string, commandId: string) => void;
  closeWindow: (windowId: string) => void;
  setActiveTab: (windowId: string, commandId: string) => void;
  updatePosition: (windowId: string, pos: { x: number; y: number }) => void;
  updateSize: (windowId: string, size: { width: number; height: number }) => void;
  
  // Drag-and-drop
  setDraggedTab: (data: { windowId: string; commandId: string } | null) => void;
  detachTab: (windowId: string, commandId: string, position: { x: number; y: number }) => void;
  attachTab: (fromWindowId: string, commandId: string, toWindowId: string) => void;
  reorderTabs: (windowId: string, commandIds: string[]) => void;
}

// Helper to calculate next window position (cascade)
let windowCount = 0;
function getNextPosition(): { x: number; y: number } {
  const offset = (windowCount % 10) * 30;
  windowCount++;
  return {
    x: window.innerWidth / 2 - 250 + offset,
    y: window.innerHeight / 2 - 175 + offset,
  };
}

export const useOutputWindowStore = create<OutputWindowStore>((set, get) => ({
  windows: {},
  draggedTab: null,

  openOutput: (commandId: string) => {
    const { windows } = get();
    const windowIds = Object.keys(windows);

    // Check if command is already open in any window
    for (const winId of windowIds) {
      const win = windows[winId];
      if (win.commandIds.includes(commandId)) {
        // Just activate that tab and window
        set({
          windows: {
            ...windows,
            [winId]: { ...win, activeCommandId: commandId },
          },
        });
        return;
      }
    }

    // If windows exist, add as new tab to the first window
    if (windowIds.length > 0) {
      const firstWinId = windowIds[0];
      const firstWin = windows[firstWinId];
      set({
        windows: {
          ...windows,
          [firstWinId]: {
            ...firstWin,
            commandIds: [...firstWin.commandIds, commandId],
            activeCommandId: commandId,
          },
        },
      });
      return;
    }

    // No windows exist, create a new one
    const newId = crypto.randomUUID();
    const position = getNextPosition();
    set({
      windows: {
        ...windows,
        [newId]: {
          id: newId,
          commandIds: [commandId],
          activeCommandId: commandId,
          position,
          size: { width: 500, height: 350 },
        },
      },
    });
  },

  closeOutput: (windowId: string, commandId: string) => {
    const { windows } = get();
    const win = windows[windowId];
    if (!win) return;

    const newCommandIds = win.commandIds.filter((id) => id !== commandId);

    // If last tab, close the window
    if (newCommandIds.length === 0) {
      const { [windowId]: removed, ...rest } = windows;
      set({ windows: rest });
      return;
    }

    // Otherwise, remove the tab and activate the first remaining tab
    const newActiveId =
      win.activeCommandId === commandId ? newCommandIds[0] : win.activeCommandId;

    set({
      windows: {
        ...windows,
        [windowId]: {
          ...win,
          commandIds: newCommandIds,
          activeCommandId: newActiveId,
        },
      },
    });
  },

  closeWindow: (windowId: string) => {
    const { windows } = get();
    const { [windowId]: removed, ...rest } = windows;
    set({ windows: rest });
  },

  setActiveTab: (windowId: string, commandId: string) => {
    const { windows } = get();
    const win = windows[windowId];
    if (!win || !win.commandIds.includes(commandId)) return;

    set({
      windows: {
        ...windows,
        [windowId]: { ...win, activeCommandId: commandId },
      },
    });
  },

  updatePosition: (windowId: string, pos: { x: number; y: number }) => {
    const { windows } = get();
    const win = windows[windowId];
    if (!win) return;

    set({
      windows: {
        ...windows,
        [windowId]: { ...win, position: pos },
      },
    });
  },

  updateSize: (windowId: string, size: { width: number; height: number }) => {
    const { windows } = get();
    const win = windows[windowId];
    if (!win) return;

    set({
      windows: {
        ...windows,
        [windowId]: { ...win, size },
      },
    });
  },

  setDraggedTab: (data: { windowId: string; commandId: string } | null) => {
    set({ draggedTab: data });
  },

  detachTab: (windowId: string, commandId: string, position: { x: number; y: number }) => {
    const { windows } = get();
    const sourceWin = windows[windowId];
    if (!sourceWin || !sourceWin.commandIds.includes(commandId)) return;

    // Remove from source window
    const newCommandIds = sourceWin.commandIds.filter((id) => id !== commandId);

    let updatedWindows = { ...windows };

    // If source window is now empty, close it
    if (newCommandIds.length === 0) {
      const { [windowId]: removed, ...rest } = updatedWindows;
      updatedWindows = rest;
    } else {
      // Update source window
      const newActiveId =
        sourceWin.activeCommandId === commandId
          ? newCommandIds[0]
          : sourceWin.activeCommandId;
      updatedWindows[windowId] = {
        ...sourceWin,
        commandIds: newCommandIds,
        activeCommandId: newActiveId,
      };
    }

    // Create new window at drop position
    const newId = crypto.randomUUID();
    updatedWindows[newId] = {
      id: newId,
      commandIds: [commandId],
      activeCommandId: commandId,
      position,
      size: { width: 500, height: 350 },
    };

    set({ windows: updatedWindows });
  },

  attachTab: (fromWindowId: string, commandId: string, toWindowId: string) => {
    const { windows } = get();
    const sourceWin = windows[fromWindowId];
    const targetWin = windows[toWindowId];

    if (!sourceWin || !targetWin || !sourceWin.commandIds.includes(commandId)) return;
    if (fromWindowId === toWindowId) return;

    // Remove from source window
    const newSourceCommandIds = sourceWin.commandIds.filter((id) => id !== commandId);

    let updatedWindows = { ...windows };

    // If source window is now empty, close it
    if (newSourceCommandIds.length === 0) {
      const { [fromWindowId]: removed, ...rest } = updatedWindows;
      updatedWindows = rest;
    } else {
      const newActiveId =
        sourceWin.activeCommandId === commandId
          ? newSourceCommandIds[0]
          : sourceWin.activeCommandId;
      updatedWindows[fromWindowId] = {
        ...sourceWin,
        commandIds: newSourceCommandIds,
        activeCommandId: newActiveId,
      };
    }

    // Add to target window
    updatedWindows[toWindowId] = {
      ...targetWin,
      commandIds: [...targetWin.commandIds, commandId],
      activeCommandId: commandId,
    };

    set({ windows: updatedWindows });
  },

  reorderTabs: (windowId: string, commandIds: string[]) => {
    const { windows } = get();
    const win = windows[windowId];
    if (!win) return;

    set({
      windows: {
        ...windows,
        [windowId]: { ...win, commandIds },
      },
    });
  },
}));
