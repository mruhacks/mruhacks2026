import { staticProjectCoverFile } from '@/content';
import { renderProjectCoverSvg } from '@/lib/project-cover-art';
import { getProjectShowcase } from '@/lib/project-showcase';

/**
 * The static export's stand-in for `/api/project-cover` (`pnpm build:static`,
 * docs/STATIC_EXPORT.md): one SVG file per showcase project, at the path
 * `projectCoverFallbackUrl` links to in that build. Every page the export
 * renders a cover on lists only showcase projects.
 */
export async function generateStaticParams() {
  const showcase = await getProjectShowcase();
  const files = (showcase?.projects ?? []).map((project) => ({ file: staticProjectCoverFile(project.title) }));
  // Cache Components needs at least one param.
  return files.length > 0 ? files : [{ file: staticProjectCoverFile('MRUHACKS') }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const showcase = await getProjectShowcase();
  const seed =
    showcase?.projects.find((project) => staticProjectCoverFile(project.title) === file)?.title ?? 'MRUHACKS';
  return new Response(renderProjectCoverSvg(seed), { headers: { 'Content-Type': 'image/svg+xml' } });
}
