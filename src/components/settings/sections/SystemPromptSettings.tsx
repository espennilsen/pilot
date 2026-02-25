import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppSettingsStore } from '../../../stores/app-settings-store';

export function SystemPromptSettings() {
  const { systemPrompt, setSystemPrompt } = useAppSettingsStore();
  const [draft, setDraft] = useState(systemPrompt);
  const [saved, setSaved] = useState(false);
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
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">System Prompt</h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          Custom instructions appended to every agent session. Use this for persistent preferences,
          coding style guidelines, or project conventions that should always apply.
          Changes take effect on the next new session.
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
