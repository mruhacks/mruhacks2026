export const instant = false;

import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as Auth from '@/lib/auth';

// The URL carries a live token; don't leak it to anything we link to.
export const metadata: Metadata = {
  title: 'Sign in',
  referrer: 'no-referrer',
};

type SearchParams = Record<string, string | string[] | undefined>;

const COPY: Record<Auth.EmailLinkKind, { title: string; description: string; label: string }> = {
  'magic-link': {
    title: 'Sign in to MRUHacks',
    description: 'Press continue to finish signing in.',
    label: 'Continue to sign in',
  },
  'verify-email': {
    title: 'Verify your email',
    description: 'Press continue to confirm your email address.',
    label: 'Verify email',
  },
};

/** The magic-link verify endpoint's `error` codes, as shown to the user. */
function failureMessage(error: SearchParams[string]): string {
  switch (error) {
    case 'INVALID_TOKEN':
      return 'This sign-in link has expired or has already been used.';
    default:
      return 'Something went wrong signing you in. Please request a new link.';
  }
}

/**
 * Landing page for emailed auth links (see `toEmailLinkConfirmUrl`). Loading
 * it spends nothing; only submitting the form hands the token to the auth endpoint.
 * Rendered outside any Suspense boundary so the form is in the initial HTML
 * and works without JavaScript. A failed magic link redirects back here with
 * `failed=1`. Signed-in users never reach this page (see `src/proxy.ts`), so a
 * resubmitted, already-spent link lands them on the dashboard.
 */
export default async function EmailLinkConfirmPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  if (params[Auth.EMAIL_LINK_FAILED_PARAM] === '1') {
    return <LinkProblem title='Sign in to MRUHacks' message={failureMessage(params.error)} />;
  }

  const kind = params[Auth.EMAIL_LINK_KIND_PARAM];
  const token = params.token;
  if (!Auth.isEmailLinkKind(kind) || typeof token !== 'string' || !token) {
    return (
      <LinkProblem
        title='Sign in to MRUHacks'
        message='This link is incomplete. Copy the whole link from the email, or request a new one.'
      />
    );
  }

  const { endpoint, params: forwarded } = Auth.EMAIL_LINKS[kind];
  const fields = forwarded.flatMap((name): { name: string; value: string }[] => {
    const value = params[name];
    return typeof value === 'string' && value ? [{ name, value }] : [];
  });

  const copy = COPY[kind];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form method='get' action={endpoint}>
          {fields.map((f) => (
            <input key={f.name} type='hidden' name={f.name} value={f.value} />
          ))}
          <Button type='submit' className='w-full'>
            {copy.label}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LinkProblem({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p className='text-destructive'>{message}</p>
        <p>
          <Link href='/signin' className='font-medium hover:underline'>
            Request a new link
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
