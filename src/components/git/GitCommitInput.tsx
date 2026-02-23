import { useState } from 'react';
import { useGitStore } from '../../stores/git-store';
import { modKey } from '../../lib/keybindings';
import { Button } from '../shared/Button';

const CONVENTIONAL_PREFIXES = [
  { label: 'feat:', desc: 'New feature' },
  { label: 'fix:', desc: 'Bug fix' },
  { label: 'docs:', desc: 'Documentation' },
  { label: 'style:', desc: 'Code style' },
  { label: 'refactor:', desc: 'Refactoring' },
  { label: 'test:', desc: 'Tests' },
  { label: 'chore:', desc: 'Maintenance' },
];

export default function GitCommitInput() {
  const { status, commit, push, isLoading } = useGitStore();
  const [message, setMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const hasStagedFiles = status && status.staged.length > 0;
  const canCommit = hasStagedFiles && message.trim().length > 0 && !isCommitting && !isPushing;

  const handleCommit = async () => {
    if (!canCommit) return;

    setIsCommitting(true);
    try {
      await commit(message.trim());
      setMessage('');
    } catch (error) {
      console.error('Failed to commit:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCommitAndPush = async () => {
    if (!canCommit) return;

    setIsCommitting(true);
    try {
      await commit(message.trim());
      setMessage('');
      setIsCommitting(false);
      
      setIsPushing(true);
      await push();
    } catch (error) {
      console.error('Failed to commit and push:', error);
    } finally {
      setIsCommitting(false);
      setIsPushing(false);
    }
  };

  const handlePrefixClick = (prefix: string) => {
    // If message already starts with a prefix, replace it
    const currentPrefix = CONVENTIONAL_PREFIXES.find(p => message.startsWith(p.label));
    if (currentPrefix) {
      setMessage(prefix + ' ' + message.substring(currentPrefix.label.length).trim());
    } else {
      setMessage(prefix + ' ' + message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-bg-surface border-b border-border">
        <span className="text-sm font-medium text-text-primary">Commit</span>
      </div>

      <div className="p-3 bg-bg-base space-y-3">
        {/* Conventional commit prefix suggestions */}
        <div className="flex flex-wrap gap-1.5">
          {CONVENTIONAL_PREFIXES.map((prefix) => (
            <button
              key={prefix.label}
              onClick={() => handlePrefixClick(prefix.label)}
              className="px-2 py-1 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded text-text-secondary hover:text-text-primary transition-colors"
              title={prefix.desc}
            >
              {prefix.label}
            </button>
          ))}
        </div>

        {/* Commit message textarea */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Commit message... (${modKey()}Enter to commit)`}
          className="w-full bg-bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent resize-none"
          style={{ minHeight: '60px' }}
          disabled={!hasStagedFiles || isCommitting || isPushing}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleCommit}
            disabled={!canCommit}
            loading={isCommitting}
            className="flex-1"
          >
            Commit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCommitAndPush}
            disabled={!canCommit}
            loading={isPushing}
            className="flex-1"
          >
            Commit & Push
          </Button>
        </div>

        {!hasStagedFiles && (
          <p className="text-xs text-text-secondary text-center">
            Stage files to commit
          </p>
        )}
      </div>
    </div>
  );
}
