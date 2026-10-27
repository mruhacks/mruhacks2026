import { projectCoverFallbackUrl } from '@/content';
import { submissionImageSources } from '@/lib/submission-images';
import { cn } from '@/lib/utils';

/**
 * A project's cover image filling its (positioned) parent, or — when there's
 * none — generated placeholder art seeded by the project's title. Shared by
 * the submission banner and the public project gallery so a project's
 * placeholder looks the same everywhere.
 *
 * `sizes` is the width the cover renders at, so the browser picks the
 * smallest public resized copy that's sharp enough (see
 * `@/lib/submission-images`).
 */
export function ProjectCover({
  coverImageUrl,
  title,
  sizes,
  lazy = false,
  className,
}: {
  coverImageUrl: string | null;
  /** Seeds the placeholder art when there's no cover image. */
  title: string;
  sizes: string;
  /** For covers likely below the fold, e.g. the gallery grid. */
  lazy?: boolean;
  className?: string;
}) {
  const sources = coverImageUrl ? submissionImageSources(coverImageUrl) : null;
  return (
    // The public copies are already resized, and the fallback `/api/assets`
    // URL needs the viewer's session — see MarkdownContent for why the Next
    // image optimizer can't be used for that. The placeholder is an SVG.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources?.src ?? coverImageUrl ?? projectCoverFallbackUrl(title)}
      srcSet={sources?.srcSet}
      sizes={sources ? sizes : undefined}
      alt=''
      loading={lazy ? 'lazy' : undefined}
      decoding='async'
      className={cn('absolute inset-0 size-full object-cover', className)}
    />
  );
}
