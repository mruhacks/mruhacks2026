import { connection, NextResponse } from 'next/server';

import * as Display from '@/lib/display/server';

/**
 * What the lobby displays show: the featured event's schedule plus the global
 * display settings. Public by design — none of it is private — and served from
 * cache; see `src/lib/display/feed.ts`.
 */
export async function GET() {
  // Run per request (from the in-memory cache) rather than being prerendered
  // into a build-time snapshot.
  await connection();
  try {
    return NextResponse.json(await Display.loadDisplayFeed(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[display/feed] failed to load feed', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
