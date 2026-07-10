'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { consumeInvite, setOwnName } from '@/app/actions/users';
import { recordOnboardingConsent } from '@/app/dashboard/account/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface WelcomeClientProps {
  needsConsent: boolean;
  userEmail: string;
  userName: string;
  /** Where to send the user once onboarding is complete. */
  returnUrl: string;
}

export function WelcomeClient({
  needsConsent,
  userEmail,
  userName,
  returnUrl,
}: WelcomeClientProps) {
  const router = useRouter();
  const needsName = userName.trim().length === 0;
  const needsOnboarding = needsName || needsConsent;

  const [consumed, setConsumed] = React.useState(false);
  const [name, setName] = React.useState(userName);
  const [acceptLegal, setAcceptLegal] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    consumeInvite().then((res) => {
      if (res.success && res.data) setConsumed(res.data.consumed);
      else if (!res.success) toast.error(res.error);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsName && name.trim().length === 0) {
      toast.error('Enter your full name');
      return;
    }
    if (needsConsent && !acceptLegal) {
      toast.error('You must accept the Terms of Use and Privacy Policy');
      return;
    }
    setSubmitting(true);
    if (needsName) {
      const nameRes = await setOwnName(name);
      if (!nameRes.success) {
        setSubmitting(false);
        toast.error(nameRes.error);
        return;
      }
    }
    if (needsConsent) {
      const consentRes = await recordOnboardingConsent(marketing);
      if (!consentRes.success) {
        setSubmitting(false);
        toast.error(consentRes.error);
        return;
      }
    }
    setSubmitting(false);
    toast.success('All set. Welcome aboard!');
    router.push(returnUrl);
  };

  const description = needsOnboarding ? (
    <>
      Signed in as <span className='font-medium'>{userEmail}</span>. Finish your
      account to continue.
    </>
  ) : (
    <>
      Signed in as <span className='font-medium'>{userEmail}</span>.
    </>
  );

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Welcome{consumed ? '!' : ' back'}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        {needsOnboarding ? (
          <>
            <CardContent>
              <form
                id='form-welcome-onboarding'
                onSubmit={handleSubmit}
                className='space-y-4'
              >
                {needsName && (
                  <div className='space-y-2'>
                    <Label htmlFor='welcome-name'>Full name</Label>
                    <Input
                      id='welcome-name'
                      autoComplete='name'
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder='Jane Doe'
                      disabled={submitting}
                      required
                    />
                  </div>
                )}
                {needsConsent && (
                  <div className='space-y-3'>
                    <div className='flex items-start gap-3'>
                      <Checkbox
                        id='welcome-legal'
                        checked={acceptLegal}
                        onCheckedChange={(v) => setAcceptLegal(v === true)}
                        disabled={submitting}
                        className='mt-0.5'
                      />
                      <Label
                        htmlFor='welcome-legal'
                        className='text-sm leading-snug font-normal'
                      >
                        I agree to the{' '}
                        <Link
                          href='/terms'
                          target='_blank'
                          className='text-primary underline underline-offset-2'
                        >
                          Terms of Use
                        </Link>{' '}
                        and{' '}
                        <Link
                          href='/privacy'
                          target='_blank'
                          className='text-primary underline underline-offset-2'
                        >
                          Privacy Policy
                        </Link>
                        .
                      </Label>
                    </div>
                    <div className='flex items-start gap-3'>
                      <Checkbox
                        id='welcome-marketing'
                        checked={marketing}
                        onCheckedChange={(v) => setMarketing(v === true)}
                        disabled={submitting}
                        className='mt-0.5'
                      />
                      <Label
                        htmlFor='welcome-marketing'
                        className='text-muted-foreground text-sm leading-snug font-normal'
                      >
                        Send me newsletters, sponsor offers, and updates about
                        future MRUHacks events.
                      </Label>
                    </div>
                  </div>
                )}
              </form>
            </CardContent>
            <CardFooter>
              <Button
                type='submit'
                form='form-welcome-onboarding'
                disabled={submitting}
                className='w-full'
              >
                {submitting ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    Saving…
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </CardFooter>
          </>
        ) : (
          <CardFooter>
            <Button asChild className='w-full'>
              <Link href={returnUrl}>Continue</Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
