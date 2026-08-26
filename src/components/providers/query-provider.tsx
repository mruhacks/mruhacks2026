'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid refetches as soon as a component mounts when data is
        // already fresh. Server-action payloads don't change second-to-
        // second, and we control invalidation explicitly on mutations.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // A per-provider lazy state initializer is stable for the browser lifetime
  // and avoids a server module singleton during Cache Components rendering.
  const [client] = React.useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
