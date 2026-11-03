import { browser } from 'wxt/browser';

import { suggestForNewBookmark } from '@/services/ai';
import { getBookmarkTree, getAllFolders } from '@/services/bookmarks';
import {
  getSettings,
  hasConfiguredKey,
  validateAndCleanPendingSuggestions,
  addPendingSuggestion,
  removePendingSuggestion,
  updateBadgeCount,
} from '@/services/storage';
import { addNodeToTrash } from '@/services/trash';

export default defineBackground(() => {
  console.log('🦦 Bookmark Otter background worker started');

  // Track bookmarks currently undergoing AI suggestion generation
  const inFlightBookmarkIds = new Set<string>();

  // Synchronize and validate badge on worker startup/wake
  validateAndCleanPendingSuggestions()
    .then((queue) => updateBadgeCount(queue.length))
    .catch((err) => console.warn('Could not sync badge count on startup:', err));

  // Configure Side Panel (Chromium) / Sidebar (Firefox) / Tab fallback (Safari) on action click
  const actionApi = (browser as any).action || (browser as any).browserAction;
  if (browser.sidePanel && (browser.sidePanel as any).setPanelBehavior) {
    (browser.sidePanel as any)
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: any) => {
        console.warn('Could not set side panel behavior:', err);
      });
  } else if ((browser as any).sidebarAction) {
    actionApi?.onClicked?.addListener?.(() => {
      (browser as any).sidebarAction?.open?.();
    });
  } else if (actionApi?.onClicked) {
    actionApi.onClicked.addListener(() => {
      browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
    });
  }

  // 1. Listen for new bookmarks being created (Address bar star or Cmd+D)
  browser.bookmarks?.onCreated?.addListener?.(async (id, bookmark) => {
    // Only handle web bookmarks, ignore folders
    if (!bookmark.url || bookmark.url.startsWith('chrome://')) return;

    inFlightBookmarkIds.add(id);

    try {
      const settings = await getSettings();
      // Check if any API key is configured
      const hasKey = hasConfiguredKey(settings);

      if (!hasKey) {
        inFlightBookmarkIds.delete(id);
        return;
      }

      // Extract page metadata if the bookmarked page is in the active tab
      let pageMeta: { description?: string; h1?: string } | undefined;
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (activeTab && activeTab.id && activeTab.url === bookmark.url) {
        try {
          const injection = await browser.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => {
              const desc =
                document.querySelector('meta[name="description"]')?.getAttribute('content') ||
                document
                  .querySelector('meta[property="og:description"]')
                  ?.getAttribute('content') ||
                '';
              const h1 = document.querySelector('h1')?.innerText?.trim() || '';
              return { description: desc.slice(0, 300), h1: h1.slice(0, 150) };
            },
          });
          if (injection && injection[0]?.result) {
            pageMeta = injection[0].result;
          }
        } catch {
          // Script injection could fail on restricted pages, ignore gracefully
        }
      }

      // Fetch folder structure
      const tree = await getBookmarkTree();
      const folders = getAllFolders(tree);

      // Generate AI suggestion in the background
      const suggestion = await suggestForNewBookmark({
        bookmarkId: id,
        originalTitle: bookmark.title,
        url: bookmark.url,
        pageMeta,
        folders,
      });

      // 1. Check if bookmark was removed/unstarred while AI was generating
      if (!inFlightBookmarkIds.has(id)) {
        console.log(
          `[AI Suggestion] Bookmark ${id} was deleted/unstarred while analyzing. Discarding.`
        );
        return;
      }
      inFlightBookmarkIds.delete(id);

      // 2. Double-check with Browser bookmarks API that the bookmark still exists
      try {
        const [existing] = await browser.bookmarks.get(id);
        if (!existing) {
          console.log(`[AI Suggestion] Bookmark ${id} no longer exists. Discarding.`);
          return;
        }
      } catch {
        console.log(`[AI Suggestion] Bookmark ${id} was removed. Discarding.`);
        return;
      }

      // Save suggestion in queue and update numeric toolbar badge
      const queue = await addPendingSuggestion(suggestion);
      await updateBadgeCount(queue.length);

      // Broadcast to any open sidepanel UI
      browser.runtime
        .sendMessage({
          type: 'SUGGESTIONS_UPDATED',
          suggestions: queue,
          newSuggestion: suggestion,
        })
        .catch(() => {
          // Sidepanel might not be open right now, which is normal
        });
    } catch (err) {
      inFlightBookmarkIds.delete(id);
      console.error('Failed to generate AI suggestion for new bookmark:', err);
    }
  });

  // 2. Listen for removed bookmarks/folders and preserve in 30-day Recycle Bin
  browser.bookmarks?.onRemoved?.addListener?.(async (id, removeInfo) => {
    // Immediately cancel in-flight analysis if this bookmark was being processed
    inFlightBookmarkIds.delete(id);

    try {
      // If deleted item was a pending suggestion, remove from queue and update badge
      const removedUrl = (removeInfo as any)?.node?.url;
      const queue = await removePendingSuggestion(id, removedUrl);
      await updateBadgeCount(queue.length);
      browser.runtime
        .sendMessage({
          type: 'SUGGESTIONS_UPDATED',
          suggestions: queue,
        })
        .catch(() => {});

      if (removeInfo && (removeInfo as any).node) {
        await addNodeToTrash((removeInfo as any).node);
      }
    } catch (err) {
      console.warn('Could not record bookmark deletion into Recycle Bin:', err);
    }
  });
});
