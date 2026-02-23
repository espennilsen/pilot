import { Icon } from '../shared/Icon';

interface SessionBranchIndicatorProps {
  branchCount: number;
}

/**
 * Shows when a conversation has branches (future: click to show branch selector)
 */
export function SessionBranchIndicator({ branchCount }: SessionBranchIndicatorProps) {
  if (branchCount <= 1) return null;

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-xs"
      title={`${branchCount} branches`}
    >
      <Icon name="GitBranch" className="w-3 h-3" />
      <span>{branchCount}</span>
    </div>
  );
}
