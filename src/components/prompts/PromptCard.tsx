import type { PromptTemplate } from '../../../shared/types';

interface PromptCardProps {
  prompt: PromptTemplate;
  onClick: (prompt: PromptTemplate) => void;
  selected?: boolean;
}

export default function PromptCard({ prompt, onClick, selected }: PromptCardProps) {
  return (
    <button
      onClick={() => onClick(prompt)}
      title={prompt.description || prompt.title}
      className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all text-center min-w-0 ${
        selected
          ? 'border-accent/50 bg-accent/10'
          : 'border-border hover:border-accent/30 hover:bg-bg-surface'
      }`}
    >
      {/* Icon */}
      <span className="text-lg leading-none">{prompt.icon}</span>

      {/* Title */}
      <span className="text-[11px] font-medium text-text-primary leading-tight truncate w-full">
        {prompt.title}
      </span>

      {/* Command badge + source indicator */}
      <div className="flex items-center gap-1">
        {prompt.command && (
          <span
            className={`text-[10px] font-mono leading-none ${
              prompt.commandConflict
                ? 'text-error line-through'
                : 'text-text-secondary'
            }`}
          >
            /{prompt.command}
          </span>
        )}
        {prompt.source === 'project' && (
          <span className="text-[10px] leading-none" title="Project prompt">📁</span>
        )}
      </div>
    </button>
  );
}
