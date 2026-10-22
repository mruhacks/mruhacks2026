/**
 * Limits for images embedded in markdown — event descriptions, wiki articles
 * and project submissions all share them, so one upload rule covers every
 * editor.
 */

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Attachments are re-served verbatim from `/api/assets`, so the allow-list is
 * limited to formats a browser renders as an image and never executes. SVG is
 * deliberately excluded: it can carry script, and it would run same-origin.
 */
const ATTACHMENT_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
]);

export type ImageUpload = {
  bytes: Uint8Array;
  contentType: string;
  /** Includes the dot, e.g. `.png`. */
  extension: string;
};

/**
 * The reason `file` breaks the shared limits, or null if it's fine. Safe to
 * call in the browser: checking before upload matters because a file past the
 * server action body limit never reaches `readImageUpload` at all — the
 * request itself fails.
 */
export function imageUploadError(file: { type: string; size: number }): string | null {
  if (!ATTACHMENT_TYPES.has(file.type)) {
    return 'Images must be JPEG, PNG, WebP, GIF or AVIF.';
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return `Images must be smaller than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/**
 * Pulls the `file` field out of an upload form and checks it against the
 * shared limits. Returns either the bytes to store or the reason to show the
 * author.
 */
export async function readImageUpload(formData: FormData): Promise<{ upload: ImageUpload } | { error: string }> {
  const value = formData.get('file');
  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') {
    return { error: 'Choose an image to upload.' };
  }

  const error = imageUploadError(value);
  if (error) return { error };
  const extension = ATTACHMENT_TYPES.get(value.type)!;

  return {
    upload: {
      bytes: new Uint8Array(await value.arrayBuffer()),
      contentType: value.type,
      extension,
    },
  };
}
