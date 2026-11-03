import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { auth, getImpersonatedUser } from '@/utils/auth';

async function stopImpersonating() {
  'use server';

  const { headers: responseHeaders } = await auth.api.stopImpersonating({
    headers: await headers(),
    returnHeaders: true,
  });

  // Called from the server, Better Auth hands back the restored admin session
  // as Set-Cookie headers instead of writing them, so copy them onto the
  // response ourselves.
  const setCookie = responseHeaders.get('set-cookie');
  if (setCookie) {
    const cookieStore = await cookies();
    parseSetCookieHeader(setCookie).forEach((cookie, name) => {
      cookieStore.set(name, cookie.value, toCookieOptions(cookie));
    });
  }

  redirect('/dashboard/admin/users');
}

export async function ImpersonationBanner() {
  const user = await getImpersonatedUser();
  if (!user) return null;

  return (
    <div className='flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950'>
      <span>
        You are impersonating <strong>{user.email}</strong>
      </span>
      <form action={stopImpersonating}>
        <button
          type='submit'
          className='cursor-pointer rounded-sm bg-amber-950/20 px-3 py-1 text-xs font-semibold transition-colors hover:bg-amber-950/30'
        >
          Stop impersonating
        </button>
      </form>
    </div>
  );
}
