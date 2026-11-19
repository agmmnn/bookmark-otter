/**
 * Returns the original URL only if it parses as a valid `http:` or `https:` URL.
 * Blocks unsafe schemes such as `javascript:`, `data:`, `file:`, or `chrome:` in UI links and fetches.
 */
export function getSafeHttpUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
