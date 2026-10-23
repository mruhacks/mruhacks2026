export const instant = false;

import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EMAIL_LINK_FAILED_PARAM,
  EMAIL_LINK_KIND_PARAM,
  EMAIL_LINKS,
  type EmailLinkKind,
  isEmailLinkKind,
  MAGIC_LINK_ERROR_CALLBACK_URL,
} from '@/lib/auth/email-link-confirm-url';

// The URL carries a live token; don't leak it to anything we link to.
export const metadata: Metadata = {
  title: 'Sign in',
  referrer: 'no-referrer',
};

type SearchParams = Record<string, string | string[] | undefined>;

const COPY: Record<EmailLinkKind, { title: string; description: string; label: string }> = {
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

/** Better Auth's magic-link `error` codes, as shown to the user. */
function failureMessage(error: SearchParams[string]): string {
  switch (error) {
    case 'INVALID_TOKEN':
      return 'This sign-in link has expired or has already been used.';
    case 'new_user_signup_disabled':
      return 'There’s no MRUHacks account for this email address.';
    default:
      return 'Something went wrong signing you in. Please request a new link.';
  }
}

/**
 * Landing page for emailed auth links (see `toEmailLinkConfirmUrl`). Loading
 * it spends nothing; only submitting the form hands the token to Better Auth.
 * Rendered outside any Suspense boundary so the form is in the initial HTML
 * and works without JavaScript. A failed magic link redirects back here with
 * `failed=1`. Signed-in users never reach this page (see `src/proxy.ts`), so a
 * resubmitted, already-spent link lands them on the dashboard.
 */
export default async function EmailLinkConfirmPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  if (params[EMAIL_LINK_FAILED_PARAM] === '1') {
    return <LinkProblem title='Sign in to MRUHacks' message={failureMessage(params.error)} />;
  }

  const kind = params[EMAIL_LINK_KIND_PARAM];
  const token = params.token;
  if (!isEmailLinkKind(kind) || typeof token !== 'string' || !token) {
    return (
      <LinkProblem
        title='Sign in to MRUHacks'
        message='This link is incomplete. Copy the whole link from the email, or request a new one.'
      />
    );
  }

  const { endpoint, params: forwarded } = EMAIL_LINKS[kind];
  const fields = forwarded.flatMap((name): { name: string; value: string }[] => {
    const value = params[name];
    return typeof value === 'string' && value ? [{ name, value }] : [];
  });
  if (kind === 'magic-link') {
    fields.push({
      name: 'errorCallbackURL',
      value: MAGIC_LINK_ERROR_CALLBACK_URL,
    });
  }

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
