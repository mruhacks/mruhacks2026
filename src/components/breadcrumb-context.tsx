'use client';

import * as React from 'react';

type ContextValue = {
  segments: Record<string, string>;
  setSegment: (id: string, label: string) => void;
};

const BreadcrumbContext = React.createContext<ContextValue>({
  segments: {},
  setSegment: () => {},
});

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [segments, setSegments] = React.useState<Record<string, string>>({});

  const setSegment = React.useCallback((id: string, label: string) => {
    setSegments((prev) => (prev[id] === label ? prev : { ...prev, [id]: label }));
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ segments, setSegment }}>
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
export function BreadcrumbSegment({ id, label }: { id: string; label: string }) {
  useBreadcrumbSegment(id, label);
  return null;
}
