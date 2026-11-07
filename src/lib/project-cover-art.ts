import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/shapes.json';

const style = new Style(definition);

/** Longer seeds are cut, so arbitrary input can't make each render costlier. */
const MAX_SEED_LENGTH = 128;

/**
 * Placeholder cover art for a project without one, seeded by its name (see
 * `projectCoverFallbackUrl`). The same seed always renders the same SVG.
 */
export function renderProjectCoverSvg(seed: string): string {
  return new Avatar(style, {
    seed: seed.slice(0, MAX_SEED_LENGTH),
    backgroundColor: ['#FEF7D2', '#FBDECC', '#FAD8D3', '#F5D0E8', '#DAD0FA', '#D3DDFB', '#E4FFFF'],
    shape1Color: ['#DAD0FA', '#D3DDFB', '#E4FFFF'],
    shape2Color: ['#FEF7D2', '#FBDECC', '#FAD8D3'],
    shape3Color: ['#F5D0E8'],
  }).toString();
}
