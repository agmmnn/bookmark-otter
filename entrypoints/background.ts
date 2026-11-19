import { browser } from 'wxt/browser';

import { runMultiStepAgentHarness } from '@/services/agentHarness';
import {
  generateReorganizationPlan,
  suggestForNewBookmark,
  testProviderConnection,
} from '@/services/ai';
import type { GeneratePlanRequest, SuggestBookmarkRequest } from '@/services/aiClient';
import { getBookmarkTree, getAllFolders } from '@/services/bookmarks';
import { checkUrlDirect } from '@/services/cleaner';
import { hasWebScanPermission } from '@/services/permissions';
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
  if (import.meta.env.DEV) {
    console.log('🦦 Bookmark Otter background worker started');
  }

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

      // Extract brief page metadata ONLY when the user has already granted optional host access.
      // Otherwise AI works seamlessly using bookmark title + URL alone.
      let pageMeta: { description?: string; h1?: string } | undefined;
      if (await hasWebScanPermission()) {
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
        if (import.meta.env.DEV) {
          console.log(
            `[AI Suggestion] Bookmark ${id} was deleted/unstarred while analyzing. Discarding.`
          );
        }
        return;
      }
      inFlightBookmarkIds.delete(id);

      // 2. Double-check with Browser bookmarks API that the bookmark still exists
      try {
        const [existing] = await browser.bookmarks.get(id);
        if (!existing) {
          if (import.meta.env.DEV) {
            console.log(`[AI Suggestion] Bookmark ${id} no longer exists. Discarding.`);
          }
          return;
        }
      } catch {
        if (import.meta.env.DEV) {
          console.log(`[AI Suggestion] Bookmark ${id} was removed. Discarding.`);
        }
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
    } catch (err: any) {
      inFlightBookmarkIds.delete(id);
      // Expected API/network errors (quota, invalid key, offline) must not pollute chrome://extensions > Errors
      console.warn('Could not generate AI suggestion for new bookmark:', err?.message || err);
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

  // 3. Handle on-demand single-bookmark AI suggestion & API test requests from Sidepanel
  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    if (!message) return false;

    if (message.type === 'AI_TEST_CONNECTION') {
      testProviderConnection(message.payload)
        .then(() => sendResponse({ ok: true }))
        .catch((err: any) =>
          sendResponse({ ok: false, error: err?.message || 'Connection test failed.' })
        );
      return true;
    }

    if (message.type === 'CHECK_URL_HEALTH') {
      const { url, timeoutMs } = message.payload as { url: string; timeoutMs?: number };
      checkUrlDirect(url, timeoutMs)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: any) =>
          sendResponse({ ok: false, error: err?.message || 'URL check failed.' })
        );
      return true;
    }

    if (message.type !== 'AI_SUGGEST_BOOKMARK') return false;

    const payload = message.payload as SuggestBookmarkRequest;
    suggestForNewBookmark(payload)
      .then((suggestion) => sendResponse({ ok: true, suggestion }))
      .catch((err: any) =>
        sendResponse({ ok: false, error: err?.message || 'Could not generate suggestion.' })
      );

    return true;
  });

  // 4. Handle long-running Copilot reorganization plans over Port with streaming progress
  browser.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== browser.runtime.id) {
      port.disconnect();
      return;
    }
    if (port.name !== 'ai-copilot-plan') return;

    let isDisconnected = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    const stopKeepAlive = () => {
      if (keepAliveTimer !== null) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };

    port.onDisconnect.addListener(() => {
      isDisconnected = true;
      stopKeepAlive();
    });

    const safePost = (msg: any) => {
      if (isDisconnected) return;
      try {
        port.postMessage(msg);
      } catch {
        isDisconnected = true;
        stopKeepAlive();
      }
    };

    port.onMessage.addListener(async (msg: any) => {
      if (!msg || msg.type !== 'START_PLAN') return;
      const payload = msg.payload as GeneratePlanRequest;

      stopKeepAlive();
      // Prevent MV3 30s service-worker idle termination during long LLM calls
      keepAliveTimer = setInterval(() => safePost({ type: 'KEEPALIVE' }), 15000);

      try {
        const plan = payload.useHarness
          ? await runMultiStepAgentHarness({
              userPrompt: payload.userPrompt,
              tree: payload.tree,
              scopePreset: payload.scopePreset,
              maxBookmarks: payload.maxBookmarks,
              resumeFromCheckpoint: payload.resumeFromCheckpoint,
              onProgress: (progress) => safePost({ type: 'PROGRESS', progress }),
            })
          : await generateReorganizationPlan({
              userPrompt: payload.userPrompt,
              compactTreeDSL: payload.compactTreeDSL,
              tree: payload.tree,
            });

        safePost({ type: 'RESULT', plan });
      } catch (err: any) {
        safePost({
          type: 'ERROR',
          error: err?.message || 'Plan generation failed.',
          checkpoint: err?.checkpoint,
        });
      } finally {
        stopKeepAlive();
      }
    });
  });
});
