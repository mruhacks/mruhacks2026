/**
 * Custom React hook for detecting mobile viewports
 *
 * This hook uses the matchMedia API to detect if the current viewport
 * is below the mobile breakpoint (768px). It updates reactively when
 * the viewport size changes.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isMobile = useIsMobile();
 *
 *   return (
 *     <div>
 *       {isMobile ? <MobileView /> : <DesktopView />}
 *     </div>
 *   );
 * }
 * ```
 */

import * as React from 'react';

/**
 * Breakpoint width in pixels that separates mobile from desktop views
 * Matches common responsive design breakpoints (tablet/small desktop)
 */
const MOBILE_BREAKPOINT = 768;

/**
 * React hook that returns whether the current viewport is mobile-sized
 *
 * The hook:
 * - Returns undefined on initial server-side render
 * - Updates to true/false after hydration based on window width
 * - Listens to window resize events and updates accordingly
 * - Cleans up event listeners on unmount
 *
 * @returns boolean indicating if the viewport is mobile-sized (< 768px)
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    // Create a media query list for the mobile breakpoint
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    // Handler to update state when media query changes
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Listen for changes to the media query
    mql.addEventListener('change', onChange);

    // Set initial value
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    // Cleanup listener on unmount
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Convert undefined to false for convenience
  return !!isMobile;
}
