/**
 * Placeholder cover art for projects without one, served at
 * `mruhacks.ca/__dicebear/?seed=<project name>` (`route` in `wrangler.json`).
 */
import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/shapes.json';

const style = new Style(definition);

export default {
  fetch(request) {
    const seed = new URL(request.url).searchParams.get('seed') ?? 'MRUHACKS';
    const svg = new Avatar(style, {
      seed,
      backgroundColor: [
        '#FADF4B',
        '#F07B31',
        '#EC624D',
        '#D841A1',
        '#6943EC',
        '#4D75EE',
        '#93FFFF',
      ],
    }).toString();
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        // Same seed always renders the same SVG.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  },
} satisfies ExportedHandler;
