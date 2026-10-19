import type { Metadata } from 'next';

import { DisplayApp } from './_components/display-app';

export const metadata: Metadata = {
  title: 'MRUHacks 2026 — Display',
  robots: { index: false, follow: false },
};

/**
 * The lobby display. Public and outside `/dashboard`, so a screen needs no
 * sign-in: open it full-screen and it follows the featured event.
 */
export default function DisplayPage() {
  return <DisplayApp />;
}
