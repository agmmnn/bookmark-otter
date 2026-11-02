import { suggestForNewBookmark } from '@/services/ai';
import { getBookmarkTree, getAllFolders } from '@/services/bookmarks';
import {
  getSettings,
  hasConfiguredKey,
  getPendingSuggestions,
  addPendingSuggestion,
  removePendingSuggestion,
  updateBadgeCount,
} from '@/services/storage';
import { addNodeToTrash } from '@/services/trash';

export default defineBackground(() => {
  console.log('🦦 Bookmark Otter background worker started');

  // Synchronize badge on worker startup/wake
  getPendingSuggestions()
    .then((queue) => updateBadgeCount(queue.length))
    .catch((err) => console.warn('Could not sync badge count on startup:', err));

  // Configure Side Panel to open on action icon click
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('Could not set side panel behavior:', err);
    });
  }

  // 1. Listen for new bookmarks being created (Address bar star or Cmd+D)
  chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    // Only handle web bookmarks, ignore folders
    if (!bookmark.url || bookmark.url.startsWith('chrome://')) return;

    try {
      const settings = await getSettings();
      // Check if any API key is configured
      const hasKey = hasConfiguredKey(settings);

      if (!hasKey) return;

      // Extract page metadata if the bookmarked page is in the active tab
      let pageMeta: { description?: string; h1?: string } | undefined;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (activeTab && activeTab.id && activeTab.url === bookmark.url) {
        try {
          const injection = await chrome.scripting.executeScript({
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

      // Save suggestion in queue and update numeric toolbar badge
      const queue = await addPendingSuggestion(suggestion);
      await updateBadgeCount(queue.length);

      // Broadcast to any open sidepanel UI
      chrome.runtime
        .sendMessage({
          type: 'SUGGESTIONS_UPDATED',
          suggestions: queue,
          newSuggestion: suggestion,
        })
        .catch(() => {
          // Sidepanel might not be open right now, which is normal
        });
    } catch (err) {
      console.error('Failed to generate AI suggestion for new bookmark:', err);
    }
  });

  // 2. Listen for removed bookmarks/folders and preserve in 30-day Recycle Bin
  chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
    try {
      // If deleted item was a pending suggestion, remove from queue and update badge
      const queue = await removePendingSuggestion(id);
      await updateBadgeCount(queue.length);
      chrome.runtime
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
