import { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useTaskStore } from '../../stores/task-store';
import type { TaskEpicProgress } from '../../../shared/types';

export function EpicProgress({ epicId, compact }: { epicId: string; compact?: boolean }) {
  const [progress, setProgress] = useState<TaskEpicProgress | null>(null);
  const getEpicProgress = useTaskStore((state) => state.getEpicProgress);
  const projectPath = useProjectStore((state) => state.projectPath);

  useEffect(() => {
    if (!projectPath) return;
    const fetchProgress = async () => {
      const epicProgress = await getEpicProgress(projectPath, epicId);
      setProgress(epicProgress);
    };

    fetchProgress();
  }, [epicId, projectPath, getEpicProgress]);

  if (!progress) {
    return null;
  }

  const { percentComplete, done: completed, total } = progress;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-bg-base rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {percentComplete}%
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="w-full bg-bg-base rounded-full h-1.5">
        <div
          className="bg-green-500 h-1.5 rounded-full transition-all"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{completed}/{total} tasks done</span>
        <span>{percentComplete}%</span>
      </div>
    </div>
  );
}
