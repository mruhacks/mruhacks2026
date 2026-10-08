import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ExternalLink, MessageCircleQuestion } from 'lucide-react';

import curtLecturing from '@/assets/crt_lecturing.png';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { JudgeFrame, loadJudgeEvent } from './judge-frame';
import { BIG, GO } from './judge-styles';

type Props = { params: Promise<{ eventId: string }> };

/** Session and DB reads stream in behind Suspense — see the event page. */
export const instant = false;

/**
 * Where every link into judging lands: how it works, before the judge is
 * sent anywhere. The help button on the judging screen comes back here.
 */
export default function JudgeIntroPage({ params }: Props) {
  return (
    <Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <JudgeIntro paramsPromise={params} />
    </Suspense>
  );
}

async function JudgeIntro({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const event = await loadJudgeEvent(segment);

  return (
    <JudgeFrame segment={segment} eventName={event.name}>
      <Card className='gap-4'>
        <CardHeader>
          <CardTitle>
            <h1 className='m-0 text-2xl font-semibold tracking-tight'>
              How MRUHacks Does Judging:
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <Image
            src={curtLecturing}
            alt='Curt the CRT, pointing at the explanation'
            className='mx-auto h-auto w-36'
            priority
          />
          <ol className='m-0 flex list-decimal flex-col gap-1.5 pl-5'>
            <li>
              We&apos;ll send you to a specific table. Talk to the team there
              and get to know them and their project.
            </li>
            <li>
              When you&apos;re done, we&apos;ll send you to the next table.
              You&apos;ll then have chance to rank them against the previous
              team you saw.{' '}
            </li>
          </ol>
          <div className='flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900'>
            <MessageCircleQuestion
              aria-hidden
              className='mt-0.5 size-4 shrink-0'
            />
            <p className='m-0'>If you have any questions, please ask us.</p>
          </div>
          <p className='text-muted-foreground m-0 text-sm'>
            Rankings use the Crowd-BT model from{' '}
            <a
              href='http://people.stern.nyu.edu/xchen3/images/crowd_pairwise.pdf'
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center gap-0.5 underline underline-offset-2'
            >
              Chen et al., 2013
              <ExternalLink aria-hidden className='size-3' />
            </a>
            .
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild className={cn(BIG, GO, 'w-full')}>
            <Link href={`/dashboard/events/${segment}/judge/table`}>
              Get on with it!
              <ArrowRight />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </JudgeFrame>
  );
}
