/**
 * @file ThemePreview — Live preview card showing how a theme looks with sample UI elements.
 */

import type { CustomTheme } from '../../../shared/types';

interface ThemePreviewProps {
  theme: CustomTheme;
}

export function ThemePreview({ theme }: ThemePreviewProps) {
  const c = theme.colors;
  const bg = c['bg-base'] ?? '#1a1b1e';
  const surface = c['bg-surface'] ?? '#24262a';
  const elevated = c['bg-elevated'] ?? '#2c2e33';
  const text = c['text-primary'] ?? '#e0e0e0';
  const textSec = c['text-secondary'] ?? '#8b8d91';
  const accent = c['accent'] ?? '#4fc3f7';
  const success = c['success'] ?? '#66bb6a';
  const error = c['error'] ?? '#ef5350';
  const warning = c['warning'] ?? '#ffa726';
  const border = c['border'] ?? '#333539';

  // Syntax colors (with defaults)
  const syn = theme.syntax ?? {};
  const synComment = syn.comment ?? textSec;
  const synKeyword = syn.keyword ?? accent;
  const synString = syn.string ?? success;
  const synNumber = syn.number ?? warning;
  const synFunction = syn.function ?? accent;
  const synVariable = syn.variable ?? text;
  const synType = syn.type ?? accent;

  // Terminal colors
  const term = theme.terminal ?? {};
  const termBg = term.background ?? bg;
  const termFg = term.foreground ?? text;
  const termGreen = term.green ?? success;
  const termBlue = term.blue ?? accent;
  const termYellow = term.yellow ?? warning;
  const termRed = term.red ?? error;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Preview</h4>

      {/* Main preview container */}
      <div
        className="rounded-lg overflow-hidden border"
        style={{ borderColor: border, backgroundColor: bg }}
      >
        {/* Fake titlebar */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ backgroundColor: elevated, borderBottom: `1px solid ${border}` }}
        >
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: error }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: warning }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: success }} />
          </div>
          <div className="flex-1 text-center">
            <span className="text-[10px]" style={{ color: textSec }}>Pilot — my-project</span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex" style={{ minHeight: 220 }}>
          {/* Sidebar */}
          <div
            className="w-[60px] p-2 flex flex-col gap-1.5"
            style={{ backgroundColor: surface, borderRight: `1px solid ${border}` }}
          >
            <div className="w-full h-2 rounded-sm" style={{ backgroundColor: accent, opacity: 0.8 }} />
            <div className="w-full h-2 rounded-sm" style={{ backgroundColor: text, opacity: 0.2 }} />
            <div className="w-full h-2 rounded-sm" style={{ backgroundColor: text, opacity: 0.15 }} />
            <div className="w-full h-2 rounded-sm" style={{ backgroundColor: text, opacity: 0.1 }} />
          </div>

          {/* Chat area */}
          <div className="flex-1 p-3 flex flex-col gap-2">
            {/* AI message */}
            <div className="flex gap-2">
              <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: accent, opacity: 0.3 }} />
              <div
                className="rounded-lg p-2 max-w-[80%]"
                style={{ backgroundColor: surface, border: `1px solid ${border}` }}
              >
                <p className="text-[10px] leading-relaxed" style={{ color: text }}>
                  Here&apos;s the function you asked about:
                </p>

                {/* Code block */}
                <div
                  className="rounded mt-1.5 p-2 font-mono text-[9px] leading-relaxed overflow-hidden"
                  style={{ backgroundColor: elevated }}
                >
                  <div>
                    <span style={{ color: synKeyword }}>function</span>
                    {' '}<span style={{ color: synFunction }}>greet</span>
                    {'('}<span style={{ color: synVariable }}>name</span>
                    {': '}<span style={{ color: synType }}>string</span>
                    {') {'}
                  </div>
                  <div style={{ paddingLeft: 12 }}>
                    <span style={{ color: synComment }}>{'// Say hello'}</span>
                  </div>
                  <div style={{ paddingLeft: 12 }}>
                    <span style={{ color: synKeyword }}>return</span>
                    {' '}<span style={{ color: synString }}>{`\`Hello, \${`}</span>
                    <span style={{ color: synVariable }}>name</span>
                    <span style={{ color: synString }}>{`}!\``}</span>
                    {';'}
                  </div>
                  <div>{'}'}</div>
                </div>
              </div>
            </div>

            {/* User message */}
            <div className="flex gap-2 justify-end">
              <div
                className="rounded-lg p-2 max-w-[70%]"
                style={{ backgroundColor: accent + '20', border: `1px solid ${accent}40` }}
              >
                <p className="text-[10px]" style={{ color: text }}>
                  Can you add error handling?
                </p>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex gap-1.5 mt-1">
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: success + '20', color: success }}
              >
                ✓ Saved
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: warning + '20', color: warning }}
              >
                ⚠ 2 pending
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: error + '20', color: error }}
              >
                ✗ Error
              </span>
            </div>

            {/* Input bar */}
            <div className="mt-auto">
              <div
                className="rounded-lg flex items-center px-2 py-1.5"
                style={{ backgroundColor: surface, border: `1px solid ${border}` }}
              >
                <span className="text-[10px] flex-1" style={{ color: textSec }}>
                  Ask anything…
                </span>
                <div
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ backgroundColor: accent }}
                >
                  <span className="text-[9px] text-white">↑</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal preview */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Terminal</h4>
        <div
          className="rounded-lg overflow-hidden border font-mono text-[10px] leading-relaxed p-3"
          style={{ backgroundColor: termBg, borderColor: border, color: termFg }}
        >
          <div>
            <span style={{ color: termGreen }}>❯</span>
            {' '}<span style={{ color: termBlue }}>git</span>
            {' status'}
          </div>
          <div>
            <span>On branch </span>
            <span style={{ color: termGreen }}>main</span>
          </div>
          <div>
            <span style={{ color: termRed }}>modified:</span>
            {' src/app.tsx'}
          </div>
          <div>
            <span style={{ color: termYellow }}>untracked:</span>
            {' src/components/ThemeEditor.tsx'}
          </div>
          <div className="mt-1">
            <span style={{ color: termGreen }}>❯</span>
            <span className="animate-pulse"> █</span>
          </div>
        </div>
      </div>

      {/* Color swatches */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Palette</h4>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(c).map(([key, color]) => (
            <div key={key} className="flex flex-col items-center gap-0.5">
              <div
                className="w-6 h-6 rounded border"
                style={{ backgroundColor: color, borderColor: border }}
                title={`${key}: ${color}`}
              />
              <span className="text-[8px] text-text-secondary truncate w-8 text-center">{key.split('-').pop()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
