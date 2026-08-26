'use client';

import * as React from 'react';

import { useIsHydrated } from '@/lib/use-is-hydrated';

type ContextValue = {
  segments: Record<string, string>;
  setSegment: (id: string, label: string) => void;
};

const BreadcrumbContext = React.createContext<ContextValue>({
  segments: {},
  setSegment: () => {},
});

const EMPTY_SEGMENTS: Record<string, string> = {};

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [segments, setSegments] = React.useState<Record<string, string>>({});

  const setSegment = React.useCallback((id: string, label: string) => {
    setSegments((prev) =>
      prev[id] === label ? prev : { ...prev, [id]: label },
    );
  }, []);

  // Page content and the header hydrate as independent boundaries, so a
  // segment registered by content's effects can land before a consumer
  // hydrates — which would make that consumer's first client render differ
  // from its SSR output. Withholding segments until hydration finishes keeps
  // every consumer's hydration render identical to the server's; the dynamic
  // crumbs then appear via a normal re-render a beat later.
  const hydrated = useIsHydrated();

  const value = React.useMemo(
    () => ({ segments: hydrated ? segments : EMPTY_SEGMENTS, setSegment }),
    [hydrated, segments, setSegment],
  );

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbContext() {
  return React.useContext(BreadcrumbContext);
}

/** Hook for client components to register a dynamic-segment label. */
export function useBreadcrumbSegment(
  id: string | null | undefined,
  label: string | null | undefined,
) {
  const { setSegment } = useBreadcrumbContext();
  React.useEffect(() => {
    if (id && label) setSegment(id, label);
  }, [id, label, setSegment]);
}

/**
 * Zero-render component for server components to register a dynamic-segment
 * label into the client breadcrumb context.
 */
export function BreadcrumbSegment({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  useBreadcrumbSegment(id, label);
  return null;
}
