import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppSettingsStore } from '../../../stores/app-settings-store';

const DEFAULT_SYSTEM_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: <pi-install>/README.md
- Additional docs: <pi-install>/docs
- Examples: <pi-install>/examples (extensions, custom tools, SDK)

[Your custom instructions are appended here]

# Project Context
[AGENTS.md and other project context files]

[Loaded skills]

Current date and time: <current date/time>
Current working directory: <project path>`;

export function SystemPromptSettings() {
  const { systemPrompt, setSystemPrompt } = useAppSettingsStore();
  const [draft, setDraft] = useState(systemPrompt);
  const [saved, setSaved] = useState(false);
  const [defaultExpanded, setDefaultExpanded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync draft when store changes externally
  useEffect(() => {
    setDraft(systemPrompt);
  }, [systemPrompt]);

  // Auto-save with debounce
  const handleChange = useCallback((value: string) => {
    setDraft(value);
    setSaved(false);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await setSystemPrompt(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }, [setSystemPrompt]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <div className="p-5 space-y-4">
      {/* Default system prompt (collapsible, read-only) */}
      <div className="bg-bg-surface border border-border rounded-md overflow-hidden">
        <button
          onClick={() => setDefaultExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-elevated/50 transition-colors"
        >
          <ChevronRight className={`w-3.5 h-3.5 text-text-secondary transition-transform ${defaultExpanded ? 'rotate-90' : ''}`} />
          <span className="text-xs font-medium text-text-secondary">Default System Prompt</span>
          <span className="text-[11px] text-text-secondary/60 ml-auto">read-only</span>
        </button>
        {defaultExpanded && (
          <div className="px-3 pb-3 border-t border-border">
            <pre className="mt-2 text-xs text-text-secondary font-mono leading-relaxed whitespace-pre-wrap overflow-auto max-h-64">
              {DEFAULT_SYSTEM_PROMPT}
            </pre>
          </div>
        )}
      </div>

      {/* User system prompt */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Your System Prompt</h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          Custom instructions appended after the default prompt. Use this for persistent preferences,
          coding style guidelines, or conventions that should always apply.
          Changes apply to all active sessions immediately.
        </p>
      </div>

      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="e.g. Always use TypeScript strict mode. Prefer functional components with hooks. Write concise commit messages."
          spellCheck={false}
          className="w-full h-64 px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary font-mono leading-relaxed resize-y outline-none focus:border-accent transition-colors placeholder:text-text-secondary/40"
          style={{ tabSize: 2 }}
        />

        {/* Save indicator */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-text-secondary">
            {draft.length > 0 ? `${draft.length} characters` : ''}
          </span>
          {saved && (
            <span className="text-xs text-success">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
