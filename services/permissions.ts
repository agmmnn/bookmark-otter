import { browser } from 'wxt/browser';

export const SCAN_HOST_ORIGINS = ['http://*/*', 'https://*/*'];

/**
 * Checks whether the optional host permission for link scanning and HTTPS checks is granted.
 */
export async function hasWebScanPermission(): Promise<boolean> {
  try {
    if (!browser.permissions?.contains) return true;
    return await browser.permissions.contains({ origins: SCAN_HOST_ORIGINS });
  } catch {
    return false;
  }
}

/**
 * Requests optional web access permissions. MUST be invoked directly inside a user click
 * handler without any preceding `await` so Chrome preserves the user gesture.
 */
export function requestWebScanPermission(): Promise<boolean> {
  if (!browser.permissions?.request) {
    return Promise.resolve(true);
  }
  return browser.permissions.request({ origins: SCAN_HOST_ORIGINS });
}

/**
 * Revokes previously granted optional host permissions for link scanning.
 */
export async function revokeWebScanPermission(): Promise<boolean> {
  try {
    if (!browser.permissions?.remove) return false;
    return await browser.permissions.remove({ origins: SCAN_HOST_ORIGINS });
  } catch {
    return false;
  }
}
