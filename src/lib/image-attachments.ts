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
 * Pulls the `file` field out of an upload form and checks it against the
 * shared limits. Returns either the bytes to store or the reason to show the
 * author.
 */
export async function readImageUpload(
  formData: FormData,
): Promise<{ upload: ImageUpload } | { error: string }> {
  const value = formData.get('file');
  if (
    !value ||
    typeof value === 'string' ||
    typeof value.arrayBuffer !== 'function'
  ) {
    return { error: 'Choose an image to upload.' };
  }

  const extension = ATTACHMENT_TYPES.get(value.type);
  if (!extension) {
    return { error: 'Images must be JPEG, PNG, WebP, GIF or AVIF.' };
  }
  if (value.size === 0 || value.size > MAX_ATTACHMENT_BYTES) {
    return {
      error: `Images must be smaller than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
    };
  }

  return {
    upload: {
      bytes: new Uint8Array(await value.arrayBuffer()),
      contentType: value.type,
      extension,
    },
  };
}
