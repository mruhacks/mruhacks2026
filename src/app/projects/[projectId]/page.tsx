import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Footer from '@/components/footer';
import { SubmissionView } from '@/components/submissions/submission-view';
import { getProjectShowcase, getPublicProject } from '@/lib/project-showcase';

import { ProjectBackLink, ProjectBackLinkFallback } from './back-link';

/**
 * Every gallery project is prerendered; one published later gets its static
 * page on first visit. Cache Components needs at least one param, so with
 * nothing published yet the route is validated against a 404.
 */
export async function generateStaticParams() {
  const { projects } = await getProjectShowcase();
  if (projects.length === 0) {
    return [{ projectId: '00000000-0000-0000-0000-000000000000' }];
  }
  return projects.map((project) => ({ projectId: project.id }));
}

export async function generateMetadata({ params }: PageProps<'/projects/[projectId]'>): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getPublicProject(projectId);
  if (!project) return {};
  return {
    title: `${project.title} — MRUHacks`,
    alternates: { canonical: `/projects/${project.id}` },
  };
}

/**
 * A published project's public page: its banner and full write-up. Never
 * shows placement. `params` is awaited outside any Suspense boundary so each
 * project gets its own static page.
 */
export default async function ProjectPage({ params }: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await params;
  const project = await getPublicProject(projectId);
  if (!project) notFound();

  return (
    <>
      <main className='mx-auto w-full max-w-4xl px-6 pt-10 pb-24'>
        <Suspense fallback={<ProjectBackLinkFallback />}>
          <ProjectBackLink />
        </Suspense>
        <SubmissionView submission={project} members={project.members} />
      </main>
      <Footer />
    </>
  );
}
