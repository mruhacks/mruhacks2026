const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether `value` is a uuid, in either case. Check an id from a URL or a
 * client before it reaches a uuid column: Postgres raises on a malformed one
 * instead of matching nothing.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
