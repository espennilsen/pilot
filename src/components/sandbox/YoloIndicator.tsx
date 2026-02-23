import { useSandboxStore } from '../../stores/sandbox-store';
import { useTabStore } from '../../stores/tab-store';

export function YoloIndicator() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const { yoloMode, toggleYolo } = useSandboxStore();

  const handleToggle = async () => {
    if (!activeTabId) return;
    await toggleYolo(activeTabId);
  };

  if (!yoloMode) {
    return null;
  }

  return (
    <button
      onClick={handleToggle}
      className="px-3 py-1 bg-warning/20 hover:bg-warning/30 text-warning rounded-md transition-colors text-sm font-medium flex items-center gap-1.5"
      title="Yolo Mode Active - Click to disable"
    >
      <span>🟡</span>
      <span>YOLO</span>
    </button>
  );
}
