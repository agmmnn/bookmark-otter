# Privacy Policy — Bookmark Otter

_Last updated: November 17, 2026_

**Bookmark Otter** is a local-first Chrome Side Panel extension designed to help you organize bookmarks, detect duplicates, clean tracking parameters, and check link health. We respect your privacy and do not operate any backend servers, analytics, or user accounts.

## 1. Data Stored Locally on Your Device

All extension preferences and operational state are stored exclusively in your browser's local storage (`chrome.storage.local` and extension `localStorage`):

- User-supplied AI provider API keys (Bring Your Own Key / BYOK)
- Selected AI provider, model name, language, theme, and retention settings
- Local Recycle Bin backups of deleted bookmarks/folders (auto-pruned after your configured retention period)
- Short-lived local snapshots for 1-click Undo of reorganization plans

We have **no access** to any of this stored data, and we do not collect telemetry, crash reports, or usage analytics.

## 2. Data Shared with AI Providers (User-Initiated Only)

Bookmark Otter does not transmit any data until you actively enable and trigger an AI feature (such as Inbox **AI Organize** or **Copilot**) using your own API key:

- **Recipient:** Requests are sent directly from your browser extension to the AI provider endpoint you selected in Settings (e.g., Google Gemini, OpenAI, Anthropic Claude, xAI Grok, Groq, or DeepSeek).
- **What is sent:** Your prompt instructions along with bookmark metadata (`title`, `url` / `domain`, and `folder path`). Only if you have additionally granted optional site access for link checking, a new bookmarked tab's `<meta name="description">` and `<h1>` may also be read to refine suggestions.
- **What is NOT sent:** Full web page body contents, browsing history outside your bookmarks, cookies, form inputs, or passwords are never stored, collected, or transmitted.

Your interactions with your chosen AI provider are governed by that provider's own privacy policy and API terms.

## 3. Link Health Checks & Favicons

- **404 Broken Link Scanner & HTTPS Verifier (`Doctor`):** Only when you manually click to scan links or verify HTTPS support, the extension sends direct HTTP `HEAD`/`GET` requests from your browser to the bookmarked URLs to check status codes and HTTPS availability.
- **Favicons:** Bookmark icons shown in the UI may be loaded via Google's favicon service (`https://www.google.com/s2/favicons`) using bookmark domains.

## 4. Permissions Explanation

- **`bookmarks`**: Read, create, move, rename, and delete bookmarks and folders when you apply changes.
- **`storage`**: Store API keys, preferences, undo snapshots, and Recycle Bin backups locally on your device.
- **`sidePanel`**: Render the Bookmark Otter workspace inside Chrome's Side Panel.
- **`tabs`**: Open selected bookmarks in new tabs and match the active tab URL when suggesting a title for a newly bookmarked page.
- **`scripting`**: Used only if you have opted into optional web access to read brief `<meta>` / `<h1>` context on a newly bookmarked tab. Page contents are never stored.
- **`host_permissions` (AI API endpoints only)**: Allows direct BYOK requests to your selected AI provider (`generativelanguage.googleapis.com`, `api.openai.com`, `api.anthropic.com`, `api.x.ai`, `api.groq.com`, `api.deepseek.com`).
- **`optional_host_permissions` (`http://*/*`, `https://*/*`)**: Requested on demand only when you click **Allow & Scan** in Doctor (`404 Links` or `HTTP` HTTPS verification). Can be revoked anytime in **Settings → Data → Revoke**.

## 5. Data Deletion & Control

You can export your preferences or erase all locally stored extension data (including API keys, Recycle Bin items, and Undo snapshots) at any time under **Settings → Data → Clear all local data**, or by uninstalling the extension.

## 6. Contact

For questions or privacy requests, please open an issue at the project repository:
https://github.com/agmmnn/bookmark-otter
