/**
 * Allow-list for `<iframe>` embeds in wiki articles.
 *
 * Article authors (`article:write:all`) are trusted not to be malicious, but
 * not trusted absolutely — a typo'd or careless URL should not be able to put
 * an arbitrary page, a phishing form, or our own origin inside an article. So
 * an embed renders only when its `src` is an https URL on one of the providers
 * below, and every rendered frame is sandboxed with a fixed set of
 * capabilities regardless of what the author wrote.
 *
 * This one list drives three layers, which must stay in sync:
 *   - the read-only renderer (`MarkdownContent` with `allowEmbeds`),
 *   - the editor's embed node and its insert dialog,
 *   - the CSP `frame-src` directive in `next.config.ts` — so even markup that
 *     somehow slips past the renderer cannot load a frame from anywhere else.
 *
 * Imported by `next.config.ts`, so keep it free of `@/` imports and anything
 * that needs a browser or a database.
 *
 * Path rules mirror CSP source-expression matching: a prefix ending in `/`
 * matches everything under it, anything else must match the path exactly.
 * Adding a provider here is the whole change — the CSP picks it up on the next
 * build.
 */

type EmbedProvider = {
  /** Shown to authors in the insert dialog. */
  name: string;
  origin: `https://${string}`;
  /** Omitted → any path on the origin. */
  paths?: readonly string[];
};

export const EMBED_PROVIDERS: readonly EmbedProvider[] = [
  {
    name: 'YouTube',
    origin: 'https://www.youtube-nocookie.com',
    paths: ['/embed/'],
  },
  { name: 'YouTube', origin: 'https://www.youtube.com', paths: ['/embed/'] },
  { name: 'Vimeo', origin: 'https://player.vimeo.com', paths: ['/video/'] },
  { name: 'Loom', origin: 'https://www.loom.com', paths: ['/embed/'] },
  {
    name: 'Google Maps',
    origin: 'https://www.google.com',
    // The share-dialog `?pb=` form, and the keyed Embed API under /v1/.
    paths: ['/maps/embed', '/maps/embed/'],
  },
  {
    name: 'Google Calendar',
    origin: 'https://calendar.google.com',
    paths: ['/calendar/embed'],
  },
  {
    name: 'Google Docs, Sheets, Slides & Forms',
    origin: 'https://docs.google.com',
  },
  {
    name: 'Google Drive',
    origin: 'https://drive.google.com',
    paths: ['/file/'],
  },
  { name: 'Figma', origin: 'https://embed.figma.com' },
  { name: 'Figma', origin: 'https://www.figma.com', paths: ['/embed'] },
];

/** Provider names for display, de-duplicated. */
export const EMBED_PROVIDER_NAMES = [
  ...new Set(EMBED_PROVIDERS.map((provider) => provider.name)),
];

/**
 * Capabilities granted to every embedded frame — never taken from the
 * author's markup. `allow-same-origin` is safe here only because every allowed
 * origin is a third party: it lets the frame keep *its own* origin (players
 * and Google Forms need their cookies/storage), it does not grant ours.
 * Deliberately absent: `allow-top-navigation*` (a frame cannot redirect the
 * article page), `allow-modals`, `allow-downloads`.
 */
export const EMBED_IFRAME_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
].join(' ');

/** Permissions-Policy for embedded frames — fixed, like the sandbox. */
export const EMBED_IFRAME_ALLOW =
  'fullscreen; picture-in-picture; encrypted-media';

/**
 * YouTube refuses to play without at least the referring origin, so
 * `no-referrer` is not an option; this sends only the origin cross-site.
 */
export const EMBED_IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin';

const MAX_EMBED_DIMENSION = 4000;

function pathMatches(pathname: string, rule: string): boolean {
  return rule.endsWith('/') ? pathname.startsWith(rule) : pathname === rule;
}

/**
 * Returns the normalized URL if `src` may be embedded, otherwise `null`.
 * Relative URLs (which would resolve to our own origin), non-https schemes
 * and URLs carrying credentials are all rejected.
 */
export function getAllowedEmbedSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null;

  let url: URL;
  try {
    // No base URL on purpose: a relative src must fail to parse.
    url = new URL(src.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const allowed = EMBED_PROVIDERS.some(
    (provider) =>
      provider.origin === url.origin &&
      (!provider.paths ||
        provider.paths.some((rule) => pathMatches(url.pathname, rule))),
  );
  return allowed ? url.href : null;
}

/**
 * Parses an author-supplied width/height. Only plain positive integers (CSS
 * pixels) are accepted — no percentages, units or expressions.
 */
export function parseEmbedDimension(value: unknown): number | undefined {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string' || !/^\d{1,4}$/.test(value.trim())) {
    return undefined;
  }
  const n = Number.parseInt(value, 10);
  return n > 0 && n <= MAX_EMBED_DIMENSION ? n : undefined;
}

/**
 * Turns what an author is likely to paste — a share link, a watch page, or a
 * provider's whole "copy embed code" snippet — into an embeddable URL. The
 * result still has to pass `getAllowedEmbedSrc`; this only saves the author
 * from hunting down the embed-specific URL by hand.
 */
export function toEmbedUrl(input: string): string {
  let value = input.trim();

  // A pasted `<iframe src="…">` snippet: keep the src, drop everything else.
  const snippet = /<iframe\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/i.exec(value);
  if (snippet) value = snippet[2].replaceAll('&amp;', '&');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtu.be') {
    const id =
      host === 'youtu.be'
        ? segments[0]
        : segments[0] === 'watch'
          ? url.searchParams.get('v')
          : segments[0] === 'shorts' || segments[0] === 'live'
            ? segments[1]
            : null;
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
  }

  if (host === 'vimeo.com' && segments[0] && /^\d+$/.test(segments[0])) {
    return `https://player.vimeo.com/video/${segments[0]}`;
  }

  if (host === 'loom.com' && segments[0] === 'share' && segments[1]) {
    return `https://www.loom.com/embed/${segments[1]}`;
  }

  return url.href;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export type EmbedAttributes = {
  src: string;
  title?: string;
  width?: number;
  height?: number;
};

/**
 * The markdown the editor writes for an embed. Always an explicit
 * `<iframe …></iframe>` pair: a self-closing `<iframe />` is not valid HTML,
 * and the renderer's HTML parser would treat everything after it as the
 * frame's fallback text.
 */
export function serializeEmbedHtml({
  src,
  title,
  width,
  height,
}: EmbedAttributes): string {
  const attributes = [`src="${escapeAttribute(src)}"`];
  if (title) attributes.push(`title="${escapeAttribute(title)}"`);
  if (width) attributes.push(`width="${width}"`);
  if (height) attributes.push(`height="${height}"`);
  return `<iframe ${attributes.join(' ')}></iframe>`;
}

/** CSP `frame-src` sources for every allowed provider. */
export function embedFrameSources(): string[] {
  return [
    ...new Set(
      EMBED_PROVIDERS.flatMap((provider) =>
        provider.paths
          ? provider.paths.map((path) => `${provider.origin}${path}`)
          : [provider.origin],
      ),
    ),
  ];
}
