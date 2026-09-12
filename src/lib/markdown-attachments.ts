/**
 * Finds object-storage attachments referenced from stored markdown.
 *
 * Attachments are uploaded before the markdown that embeds them is saved, so
 * an upload the author then undid leaves an orphan in the bucket. Deleting a
 * whole article is the one point where we can cheaply tell which objects are
 * now unreachable — this scan is what makes that possible.
 *
 * It matches the URL shape written by `eventAttachmentUrl`, in whatever
 * syntax the editor emitted (`![alt](url)`, a bare `<url>`, or an `<img
 * src="url">` if raw HTML ever slips in), rather than parsing the markdown
 * into an AST: a superset of "URLs that appear in this text" is exactly right
 * for a "is this still referenced anywhere?" question, where a false positive
 * only means keeping an object one save longer.
 */

const ATTACHMENT_URL_PATTERN =
  /\/api\/assets\/(event-content\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10})/gi;

export function collectAttachmentKeys(
  markdown: string | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!markdown) return keys;
  for (const match of markdown.matchAll(ATTACHMENT_URL_PATTERN)) {
    // Keys are generated lowercase; normalizing keeps a hand-edited link with
    // uppercase hex from reading as a different object than the one stored.
    if (match[1]) keys.add(match[1].toLowerCase());
  }
  return keys;
}
