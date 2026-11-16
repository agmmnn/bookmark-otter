export { cn } from 'cn';

const HAS_ALPHANUMERIC_REGEX = /[\p{L}\p{N}]/u;

/**
 * Checks whether a string consists solely of emojis / symbols / whitespace with no alphanumeric text.
 */
export function isEmojiOnlyTitle(title?: string): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return !HAS_ALPHANUMERIC_REGEX.test(trimmed);
}

/**
 * Formats a folder title so that empty or emoji-only folder names include a disambiguating
 * parent segment or "Untitled folder" / "Adsız klasör" label.
 */
export function formatFolderTitle(title?: string, path?: string, lang: 'en' | 'tr' = 'en'): string {
  const untitled = lang === 'tr' ? 'Adsız klasör' : 'Untitled folder';
  const trimmed = title?.trim() || '';
  if (!trimmed) return untitled;

  if (isEmojiOnlyTitle(trimmed)) {
    const parts = (path || '')
      .split(' / ')
      .map((p) => p.trim())
      .filter((p) => p && p !== 'Root' && p !== trimmed && !isEmojiOnlyTitle(p));
    const parentHint = parts.length > 0 ? parts[parts.length - 1] : untitled;
    return `${trimmed} (${parentHint})`;
  }

  return trimmed;
}

/**
 * Truncates a folder path from the start so the final folder segment is always visible.
 * Full path should be passed as `title` tooltip on the element.
 */
export function formatShortFolderPath(path?: string, lang: 'en' | 'tr' = 'en'): string {
  if (!path) return '';
  const parts = path
    .split(' / ')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'Root');

  if (parts.length === 0) return path;
  const lastRaw = parts[parts.length - 1]!;
  const lastFormatted = formatFolderTitle(lastRaw, path, lang);

  if (parts.length === 1) {
    return lastFormatted;
  }
  return `… / ${lastFormatted}`;
}
