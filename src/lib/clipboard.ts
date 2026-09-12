/**
 * Clipboard write that never throws. `navigator.clipboard` is undefined on
 * non-secure origins (an http:// preview host, a LAN IP at the event), and
 * rejects outright when the browser denies the permission — callers need a
 * boolean so they can show a failure message instead of silently no-opping.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator?.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
