import { Code2, Globe, PlayCircle } from 'lucide-react';

type LinkFields = {
  title: string;
  repoUrl: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
};

/** A project's repo, demo and video links — whichever it has. */
export function projectLinks(project: Omit<LinkFields, 'title'>) {
  return [
    { href: project.repoUrl, label: 'Repository', icon: Code2 },
    { href: project.demoUrl, label: 'Live demo', icon: Globe },
    { href: project.videoUrl, label: 'Video', icon: PlayCircle },
  ].filter((link): link is typeof link & { href: string } => !!link.href);
}

/** `projectLinks` as a compact icon row, for project cards. */
export function ProjectLinks({ project }: { project: LinkFields }) {
  const links = projectLinks(project);
  if (links.length === 0) return null;

  return (
    <div className='flex gap-2'>
      {links.map(({ icon: Icon, href, label }) => (
        <a
          key={label}
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          aria-label={`${label} for ${project.title}`}
          className='hover:text-foreground transition-colors'
        >
          <Icon className='size-4' aria-hidden />
        </a>
      ))}
    </div>
  );
}
