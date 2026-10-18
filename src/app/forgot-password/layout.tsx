import type { Metadata } from 'next';

// Account/app pages aren't useful search results; keep them out of the index.
export const metadata: Metadata = { robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
