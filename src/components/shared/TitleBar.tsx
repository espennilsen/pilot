import { useEffect, useState } from 'react';
import appIcon from '../../assets/icon-48.png';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = window.api.platform === 'darwin';

  useEffect(() => {
    // Get initial maximized state
    window.api.windowIsMaximized().then(setIsMaximized);

    // Listen for maximize state changes
    const unsubscribe = window.api.onWindowMaximizedChanged((maximized) => {
      setIsMaximized(maximized);
    });

    return unsubscribe;
  }, []);

  const handleMinimize = () => {
    window.api.windowMinimize();
  };

  const handleMaximize = () => {
    window.api.windowMaximize();
  };

  const handleClose = () => {
    window.api.windowClose();
  };

  return (
    <div 
      className="h-[38px] bg-bg-surface border-b border-border flex items-center justify-between select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side - spacer for macOS traffic lights */}
      <div className={isMac ? 'w-[78px]' : 'w-4'} />

      {/* Center - app title */}
      <div className="flex-1 flex items-center justify-center gap-1.5">
        <img src={appIcon} alt="" className="w-4 h-4" draggable={false} />
        <span className="text-text-secondary text-xs font-medium">Pilot</span>
      </div>

      {/* Right side - window controls (Windows/Linux only) */}
      <div className={isMac ? 'w-[78px]' : 'flex items-center'}>
        {!isMac && (
          <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Minimize button */}
            <button
              onClick={handleMinimize}
              className="w-12 h-[38px] flex items-center justify-center hover:bg-bg-elevated transition-colors"
              aria-label="Minimize"
            >
              <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0.5H10" stroke="currentColor" strokeWidth="1" className="text-text-secondary" />
              </svg>
            </button>

            {/* Maximize/Restore button */}
            <button
              onClick={handleMaximize}
              className="w-12 h-[38px] flex items-center justify-center hover:bg-bg-elevated transition-colors"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                // Restore icon (overlapping squares)
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M2.5 2.5V0.5H9.5V7.5H7.5M0.5 2.5H7.5V9.5H0.5V2.5Z"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-text-secondary"
                  />
                </svg>
              ) : (
                // Maximize icon (single square)
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect
                    x="0.5"
                    y="0.5"
                    width="9"
                    height="9"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-text-secondary"
                  />
                </svg>
              )}
            </button>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="w-12 h-[38px] flex items-center justify-center hover:bg-error transition-colors"
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-text-secondary"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
