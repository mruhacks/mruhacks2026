/**
 * The center panel's default state before an article is picked from the
 * sidebar (see `./layout.tsx`, which renders that sidebar and already
 * 404s/redirects before this ever mounts).
 */
export default function EventWikiIndexPage() {
  return (
    <div className='text-muted-foreground flex min-h-[50vh] items-center justify-center rounded-lg border border-dashed p-12 text-center text-sm'>
      Select an article from the sidebar to get started.
    </div>
  );
}
