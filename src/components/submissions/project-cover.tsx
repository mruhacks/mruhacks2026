import { cn } from '@/lib/utils';

/**
 * A project's cover image filling its (positioned) parent, or — when there's
 * none — the default avatar's brand gradient, washed right out. Shared by the
 * submission banner and the public project gallery so a project's
 * placeholder looks the same everywhere.
 */
export function ProjectCover({ coverImageUrl, className }: { coverImageUrl: string | null; className?: string }) {
  return coverImageUrl ? (
    // Served from `/api/assets`, which redirects to a presigned URL — see
    // MarkdownContent for why the Next image optimizer can't be used.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={coverImageUrl} alt='' className={cn('absolute inset-0 size-full object-cover', className)} />
  ) : (
    <div
      aria-hidden
      className={cn('absolute inset-0 bg-(image:--gradient-brand) opacity-10 dark:opacity-15', className)}
    />
  );
}
