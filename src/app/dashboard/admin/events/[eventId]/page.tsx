import { redirect } from 'next/navigation';

/**
 * `redirect()` is request-time. This `children` slot is its own segment
 * under the parallel-route layout and does not inherit that layout's
 * `instant = false`.
 */
export const instant = false;

export default function EventPage() {
  // Redirect to overview by default
  redirect('?tab=overview');
}
