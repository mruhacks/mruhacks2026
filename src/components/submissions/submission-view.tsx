import type * as React from 'react';
import { Code2, Eye, EyeOff, Globe, PlayCircle } from 'lucide-react';

import { LocalDateTime } from '@/components/local-date-time';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Shown wherever a submission's last editor has since deleted their account. */
export const DELETED_USER_LABEL = '[deleted user]';

export type SubmissionDisplay = {
  title: string;
  markdown: string;
  coverImageUrl: string | null;
  repoUrl: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
  published: boolean;
  updatedAt: Date | string;
  lastEditedByName: string | null;
};

/**
 * "Private" / "Public", the same everywhere a submission's state shows. Only
 * a public project is judged; the `published` column is the same flag.
 * With `onToggle` the pill is a button that flips it.
 */
export function SubmissionStatusBadge({
  published,
  onToggle,
  disabled,
}: {
  published: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const content = published ? (
    <>
      <Eye aria-hidden />
      Public
    </>
  ) : (
    <>
      <EyeOff aria-hidden />
      Private
    </>
  );
  const variant = published ? 'success' : 'secondary';

  if (!onToggle) return <Badge variant={variant}>{content}</Badge>;
  return (
    <Badge
      asChild
      variant={variant}
      className='cursor-pointer hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50'
    >
      <button
        type='button'
        onClick={onToggle}
        disabled={disabled}
        title={published ? 'Make private' : 'Make public'}
        aria-label={
          published
            ? 'Public — click to make private'
            : 'Private — click to make public'
        }
      >
        {content}
      </button>
    </Badge>
  );
}

/**
 * The project's title banner: the cover image washed into the background
 * (or the brand gradient when there is none). Shared by the editor and the
 * read-only view so a project looks the same while and after it's written.
 */
export function SubmissionBanner({
  title,
  coverImageUrl,
  action,
  children,
}: {
  title: string;
  coverImageUrl: string | null;
  /** Pinned top-right, e.g. a delete button. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        'relative isolate flex flex-col gap-3 overflow-hidden rounded-xl border p-6',
        coverImageUrl && 'min-h-56 justify-end',
      )}
    >
      {coverImageUrl ? (
        <>
          {/* Served from `/api/assets`, which needs the session cookie — see
              MarkdownContent for why the Next image optimizer can't be used. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt=''
            className='absolute inset-0 -z-10 size-full object-cover'
          />
          <div
            aria-hidden
            className='from-background via-background/80 to-background/20 absolute inset-0 -z-10 bg-linear-to-t'
          />
        </>
      ) : (
        // The default avatar's brand gradient, washed right out.
        <div
          aria-hidden
          className='absolute inset-0 -z-10 opacity-10 dark:opacity-15'
          style={{ background: 'var(--gradient-brand)' }}
        />
      )}
      {action && <div className='absolute top-3 right-3'>{action}</div>}
      <div className={cn('flex min-w-0 flex-col gap-2', action && 'pr-12')}>
        <h1 className='text-3xl font-semibold tracking-tight wrap-break-word'>
          {title || "Your team's project"}
        </h1>
        {children}
      </div>
    </header>
  );
}

/**
 * A project submission, read-only: the team's view once the deadline has
 * frozen it, and the organizer view of any team's project. Rendered without
 * embeds or raw HTML — participants, not organizers, write these.
 */
export function SubmissionView({
  submission,
  members,
  action,
  notice,
}: {
  submission: SubmissionDisplay;
  /** Team roster, for views where whose project this is isn't obvious. */
  members?: string[];
  /** Pinned to the banner's top-right corner. */
  action?: React.ReactNode;
  /** A line under the banner's links, e.g. "this is final". */
  notice?: React.ReactNode;
}) {
  const links = [
    { href: submission.repoUrl, label: 'Repository', icon: Code2 },
    { href: submission.demoUrl, label: 'Live demo', icon: Globe },
    { href: submission.videoUrl, label: 'Video', icon: PlayCircle },
  ].filter((link): link is typeof link & { href: string } => !!link.href);

  return (
    <article className='flex flex-col gap-6'>
      <SubmissionBanner
        title={submission.title}
        coverImageUrl={submission.coverImageUrl}
        action={action}
      >
        <div className='flex flex-wrap items-center gap-2'>
          <SubmissionStatusBadge published={submission.published} />
          {links.map(({ href, label, icon: Icon }) => (
            <Button
              key={label}
              asChild
              variant='outline'
              size='icon-sm'
              className='bg-background/80 backdrop-blur-sm'
            >
              <a
                href={href}
                target='_blank'
                rel='noreferrer'
                aria-label={label}
                title={label}
              >
                <Icon />
              </a>
            </Button>
          ))}
        </div>
        {members && members.length > 0 && (
          <p className='text-muted-foreground text-sm'>
            By {members.join(', ')}
          </p>
        )}
        {notice && <p className='text-muted-foreground text-sm'>{notice}</p>}
      </SubmissionBanner>

      <Card className='gap-6 p-6'>
        {submission.markdown.trim() ? (
          <MarkdownContent
            markdown={submission.markdown}
            allowRawHtml={false}
          />
        ) : (
          <p className='text-muted-foreground text-sm'>No write-up yet.</p>
        )}

        <p className='text-muted-foreground text-xs'>
          Last edited by {submission.lastEditedByName ?? DELETED_USER_LABEL} on{' '}
          <LocalDateTime
            value={submission.updatedAt}
            dateStyle='medium'
            timeStyle='short'
          />
        </p>
      </Card>
    </article>
  );
}
