import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Allow-list applied to markdown after raw HTML is parsed.
 *
 * Built on `rehype-sanitize`'s default schema — GitHub's own comment
 * allow-list — because the content we render is the same shape: markdown from
 * a trusted-ish author, plus whatever raw HTML the editor emitted. That schema
 * already drops `<script>`, `<iframe>`, `<style>`, every `on*` handler, and
 * any `src`/`href` whose protocol is not http(s).
 *
 * The one deliberate addition is pinning `width`/`height` on `<img>`. Both
 * currently ride in via the default schema's global attribute list, but
 * resized images are the reason we parse raw HTML at all — if an upstream
 * release ever trims that list, images would silently snap back to full size
 * rather than fail loudly. Naming them here makes the dependency explicit.
 */
export const MARKDOWN_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height'],
  },
};
