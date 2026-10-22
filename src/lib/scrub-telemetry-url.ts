/** Query params that carry live credentials, e.g. an emailed sign-in token. */
const SECRET_PARAMS = ['token'];

/**
 * `url` with credential-bearing query params removed, for anything reported
 * to third-party analytics. The email-link confirm page (`/signin/verify`)
 * renders with a still-valid token in its URL.
 */
export function scrubTelemetryUrl(url: string): string {
  const parsed = new URL(url);
  let changed = false;
  for (const name of SECRET_PARAMS) {
    if (parsed.searchParams.has(name)) {
      parsed.searchParams.delete(name);
      changed = true;
    }
  }
  return changed ? parsed.toString() : url;
}
