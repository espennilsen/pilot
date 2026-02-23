import { useState, useEffect, useMemo } from 'react';

interface LayoutMode {
  isCompanion: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  platform: 'electron' | 'ios' | 'browser';
}

/**
 * Hook for detecting responsive layout mode and platform.
 * 
 * Tracks viewport width and detects:
 * - Companion mode (running in browser without Electron)
 * - Device type (mobile/tablet/desktop)
 * - Platform (electron/ios/browser)
 * 
 * @returns LayoutMode object with breakpoint and platform flags
 */
export function useLayoutMode(): LayoutMode {
  // Track viewport width
  const [viewportWidth, setViewportWidth] = useState<number>(window.innerWidth);

  // Update viewport width on resize
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    
    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Compute layout mode from viewport width and environment
  const layoutMode = useMemo<LayoutMode>(() => {
    // Detect companion mode - running in browser without Electron IPC
    const isCompanion = typeof window.api === 'undefined';

    // Detect iOS from user agent
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);

    // Determine platform
    let platform: 'electron' | 'ios' | 'browser';
    if (!isCompanion) {
      // window.api exists - running in Electron
      platform = 'electron';
    } else if (isIOS) {
      // Companion mode on iOS device
      platform = 'ios';
    } else {
      // Companion mode in browser
      platform = 'browser';
    }

    // Responsive breakpoints
    const isMobile = viewportWidth < 768;
    const isTablet = viewportWidth >= 768 && viewportWidth <= 1024;
    const isDesktop = viewportWidth > 1024;

    return {
      isCompanion,
      isMobile,
      isTablet,
      isDesktop,
      platform,
    };
  }, [viewportWidth]);

  return layoutMode;
}
