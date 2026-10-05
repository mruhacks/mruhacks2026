import { Code2, ExternalLink, PlayCircle } from 'lucide-react';

import { LocalDateTime } from '@/components/local-date-time';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

/** "Draft" / "Published", the same everywhere a submission's state shows. */
export function SubmissionStatusBadge({ published }: { published: boolean }) {
  return published ? (
    <Badge variant='success'>Published</Badge>
  ) : (
    <Badge variant='secondary'>Draft</Badge>
  );
}

/**
 * A project submission, read-only: the team's view once the deadline has
 * frozen it, and the admin view of any team's project. Rendered without
 * embeds or raw HTML — participants, not organizers, write these.
 */
export function SubmissionView({
  submission,
  members,
}: {
  submission: SubmissionDisplay;
  /** Team roster, for views where whose project this is isn't obvious. */
  members?: string[];
}) {
  const links = [
    { href: submission.repoUrl, label: 'Repository', icon: Code2 },
    { href: submission.demoUrl, label: 'Live demo', icon: ExternalLink },
    { href: submission.videoUrl, label: 'Video', icon: PlayCircle },
  ].filter((link): link is typeof link & { href: string } => !!link.href);

  return (
    <article className='flex flex-col gap-6'>
      <header className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-semibold tracking-tight wrap-break-word'>
            {submission.title}
          </h2>
          <SubmissionStatusBadge published={submission.published} />
        </div>
        {members && members.length > 0 && (
          <p className='text-muted-foreground text-sm'>
            By {members.join(', ')}
          </p>
        )}
        {links.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            {links.map(({ href, label, icon: Icon }) => (
              <Button key={label} asChild variant='outline' size='sm'>
                <a href={href} target='_blank' rel='noreferrer'>
                  <Icon data-icon='inline-start' />
                  {label}
                </a>
              </Button>
            ))}
          </div>
        )}
      </header>

      {submission.coverImageUrl && (
        // Served from `/api/assets`, which needs the viewer's session cookie —
        // the Next image optimizer fetches without one. See MarkdownContent.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={submission.coverImageUrl}
          alt=''
          className='max-h-96 w-full rounded-lg border object-cover'
        />
      )}

      {submission.markdown.trim() ? (
        <MarkdownContent markdown={submission.markdown} allowRawHtml={false} />
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
    </article>
  );
}
