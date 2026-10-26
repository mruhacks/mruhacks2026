import Link from 'next/link';
import { ArrowRightIcon, TrophyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectLinks } from '@/components/project-links';
import { ProjectCover } from '@/components/submissions/project-cover';
import { cn } from '@/lib/utils';
import { getProjectShowcase, type ShowcaseProject } from '@/lib/project-showcase';

const PLACES = [
  {
    label: '1st',
    // Center column on desktop, first when stacked.
    order: 'md:order-2',
    banner: 'h-48 from-amber-200 to-amber-50 md:h-56',
    badge: 'bg-amber-400',
  },
  {
    label: '2nd',
    order: 'md:order-1',
    banner: 'h-40 from-zinc-200 to-zinc-50 md:h-44',
    badge: 'bg-zinc-300',
  },
  {
    label: '3rd',
    order: 'md:order-3',
    banner: 'h-32 from-orange-200 to-orange-50 md:h-36',
    badge: 'bg-orange-300',
  },
] as const;

/**
 * Podium
 *
 * Project showcase for the homepage: the top three projects arranged as a
 * podium (2nd, 1st, 3rd) on desktop and stacked in placement order on
 * mobile, linking to `/projects` for the rest. Hidden until all three of
 * the featured event's podium places are awarded.
 *
 * Data comes from `getProjectShowcase` (`'use cache'`), so the section is
 * part of the homepage's prerendered static shell.
 *
 * @returns section for the project showcase
 */
export async function Podium() {
  const showcase = await getProjectShowcase();
  if (!showcase) return null;

  return (
    <div className='flex w-full flex-col items-center'>
      <h2 className='text-pre-title-purple mb-6 text-sm font-semibold sm:mb-10 sm:text-base'>Meet the Winners</h2>
      <ol className='grid w-full max-w-sm grid-cols-1 gap-4 md:max-w-4xl md:grid-cols-3 md:items-end'>
        {showcase.podium.map((project, i) => (
          <PodiumCard key={project.id} project={project} place={PLACES[i]} />
        ))}
      </ol>

      <Button asChild variant='ghost' size='lg' className='mt-10 ring-1 ring-(--ink-200) ring-inset'>
        <Link href='/projects'>
          View all projects
          <ArrowRightIcon aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

function PodiumCard({ project, place }: { project: ShowcaseProject; place: (typeof PLACES)[number] }) {
  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-xl border bg-white shadow-md transition-shadow hover:shadow-lg',
        place.order,
      )}
    >
      <div className={cn('relative isolate bg-linear-to-br p-3', place.banner)}>
        {project.coverImageUrl && <ProjectCover coverImageUrl={project.coverImageUrl} className='-z-10' />}
        <span
          className={cn(
            'text-card-text inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
            place.badge,
          )}
        >
          <TrophyIcon className='size-4' aria-hidden />
          {place.label}
          <span className='sr-only'> place</span>
        </span>
      </div>
      <ProjectDetails project={project} />
    </li>
  );
}

function ProjectDetails({ project }: { project: ShowcaseProject }) {
  return (
    <div className='flex flex-col gap-2 p-4'>
      <h3 className='text-lg font-semibold wrap-break-word'>
        {/* Stretched over the whole card; the icon links sit above it. */}
        <Link
          href={{
            pathname: `/projects/${project.id}`,
            query: { back: '/' },
          }}
          className='after:absolute after:inset-0 after:content-[""] hover:underline'
        >
          {project.title}
        </Link>
      </h3>
      {project.members.length > 0 && <p className='text-description text-sm'>By {project.members.join(', ')}</p>}
      <div className='text-description relative z-10'>
        <ProjectLinks project={project} />
      </div>
    </div>
  );
}
