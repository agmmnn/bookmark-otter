export { cn } from 'cn';
import { useState, useEffect, useRef } from 'react';

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
    return `${trimmed} · ${parentHint}`;
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

/**
 * Truncates a folder path in the middle (`First / … / Last`) so both root context
 * and the final folder name remain visible in narrow rows.
 */
export function formatMiddleFolderPath(path?: string, lang: 'en' | 'tr' = 'en'): string {
  if (!path) return '';
  const parts = path
    .split(' / ')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'Root');

  if (parts.length === 0) return path;
  const lastRaw = parts[parts.length - 1]!;
  const lastFormatted = formatFolderTitle(lastRaw, path, lang);

  if (parts.length === 1) {
    if (lastFormatted.length > 24) {
      return `${lastFormatted.slice(0, 11)}…${lastFormatted.slice(-10)}`;
    }
    return lastFormatted;
  }

  const firstRaw = parts[0]!;
  const firstShort = firstRaw.length > 14 ? `${firstRaw.slice(0, 12)}…` : firstRaw;

  if (parts.length === 2) {
    const combined = `${firstShort} / ${lastFormatted}`;
    if (combined.length > 28) {
      return `${firstRaw.slice(0, 8)}… / ${lastFormatted}`;
    }
    return combined;
  }

  return `${firstShort} / … / ${lastFormatted}`;
}

export type TabBarStage = 'wide' | 'medium' | 'narrow';

/**
 * Observes a tab bar container's inline-size (`container-type: inline-size`) and computes
 * the 3-stage responsive layout ('wide' | 'medium' | 'narrow') dynamically from `tabCount`
 * (~84px per labeled tab) so adding or removing tabs never breaks thresholds.
 */
export function useResponsiveTabStage<T extends HTMLElement = HTMLElement>(
  tabCount: number,
  pxPerLabeledTab = 84
) {
  const containerRef = useRef<T | null>(null);
  const [stage, setStage] = useState<TabBarStage>('wide');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const wideThreshold = tabCount * pxPerLabeledTab;
    const mediumThreshold = pxPerLabeledTab + Math.max(0, tabCount - 1) * 38;

    const updateStage = (inlineWidth: number) => {
      if (inlineWidth <= 0) return;
      if (inlineWidth >= wideThreshold) {
        setStage('wide');
      } else if (inlineWidth >= mediumThreshold) {
        setStage('medium');
      } else {
        setStage('narrow');
      }
    };

    updateStage(el.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const inlineSize =
          entry.borderBoxSize?.[0]?.inlineSize ??
          entry.contentRect.width ??
          el.getBoundingClientRect().width;
        updateStage(inlineSize);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [tabCount, pxPerLabeledTab]);

  return { containerRef, stage };
}
