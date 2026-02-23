import { FileText } from 'lucide-react';

interface PromptLibraryButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function PromptLibraryButton({ onClick, disabled = false }: PromptLibraryButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Prompt Library"
    >
      <FileText className="w-4 h-4" />
    </button>
  );
}
