import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronLeftIcon } from 'lucide-react';

import Footer from '@/components/footer';
import { ProjectCover } from '@/components/submissions/project-cover';
import { getFeaturedEventSchedule } from '@/lib/featured-event';
import { getProjectShowcase } from '@/lib/project-showcase';

export const metadata: Metadata = {
  title: 'All Projects — MRUHacks',
  description: 'Every project submitted at MRUHacks.',
  alternates: { canonical: '/projects' },
};

/**
 * The project gallery: every public project in alphabetical order — never
 * placement order (see `getProjectShowcase`), each linking to its own page.
 * Both reads are cached, so the page prerenders as static.
 */
export default async function ProjectsPage() {
  const [{ projects }, schedule] = await Promise.all([getProjectShowcase(), getFeaturedEventSchedule()]);
  const eventName = schedule?.name ?? 'MRUHacks';

  return (
    <>
      <main className='mx-auto w-full max-w-7xl bg-white'>
        <section className='px-6 pt-10 pb-8 sm:px-14'>
          <Link
            href='/'
            className='mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-(--ink-500) hover:text-black'
          >
            <ChevronLeftIcon className='size-4' aria-hidden />
            Back to MRUHacks
          </Link>
          <p className='text-pre-title-purple text-sm font-semibold sm:text-base'>{eventName}</p>
          <h1 className='my-3 text-[40px] leading-none font-semibold tracking-[-0.04em] sm:text-[56px]'>
            All Projects
          </h1>
          <p className='max-w-xl text-base text-(--ink-700)'>Every project submitted at {eventName}.</p>
        </section>

        <div className='mx-6 flex items-baseline justify-end gap-4 border-b border-(--ink-200) pb-4 sm:mx-14'>
          <span className='font-(family-name:--font-dm-mono) text-[13px] text-(--ink-500)'>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>
        {projects.length > 0 ? (
          <ul className='grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-10 px-6 pt-6 pb-24 sm:px-14'>
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={{
                    pathname: `/projects/${project.id}`,
                    query: { back: '/projects' },
                  }}
                  className='group flex flex-col gap-1'
                >
                  <div className='relative isolate mb-2.5 aspect-16/10 overflow-hidden rounded-lg border-2 border-black bg-white transition-transform duration-150 group-hover:-rotate-[1.5deg]'>
                    <ProjectCover coverImageUrl={project.coverImageUrl} />
                  </div>
                  <h2 className='text-xl leading-[1.1] font-semibold tracking-[-0.04em] wrap-break-word'>
                    {project.title}
                  </h2>
                  {project.members.length > 0 && (
                    <p className='font-(family-name:--font-dm-mono) text-[13px] leading-[1.4] text-pretty text-(--ink-500)'>
                      {project.members.join(', ')}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className='px-6 pt-6 pb-24 text-(--ink-500) sm:px-14'>
            Projects will show up here once teams publish them.
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
