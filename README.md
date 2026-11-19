<div align="center">
  <img src="./assets/logo.png" width="96" alt="Bookmark Otter Logo" style="border-radius: 20px; margin-bottom: 12px;" />
  <h1>Bookmark Otter</h1>

  <p>
    <a href="https://chromewebstore.google.com/detail/bookmark-otter-%E2%80%93-ai-bookm/pdnpmlfkbepngbgacjgeobigmpchlimc" target="_blank" rel="noopener noreferrer">
      <img src="https://shieldcn.dev/badge/Chrome%20Web%20Store.svg?size=xs&theme=blue&logo=chromewebstore" alt="Chrome Web Store" />
    </a>
    <a href="https://github.com/agmmnn/bookmark-otter/releases" target="_blank" rel="noopener noreferrer">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://www.shieldcn.dev/github/release/agmmnn/bookmark-otter.svg?size=xs&amp;mode=dark" />
        <img alt="Release" src="https://www.shieldcn.dev/github/release/agmmnn/bookmark-otter.svg?size=xs&amp;mode=light" />
      </picture>
    </a>
    <img src="https://shieldcn.dev/badge/Manifest-V3.svg?size=xs&theme=emerald" alt="Manifest V3" />
    <a href="./LICENSE">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://www.shieldcn.dev/github/license/agmmnn/bookmark-otter.svg?variant=ghost&amp;size=xs&amp;mode=dark" />
        <img alt="License" src="https://www.shieldcn.dev/github/license/agmmnn/bookmark-otter.svg?variant=ghost&amp;size=xs&amp;mode=light" />
      </picture>
    </a>
  </p>

  <p><strong>Free, open-source AI bookmark manager, organizer &amp; link health suite in your Chrome Side Panel.</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/bookmark-otter-%E2%80%93-ai-bookm/pdnpmlfkbepngbgacjgeobigmpchlimc"><strong>Install from Chrome Web Store →</strong></a>
    ·
    <a href="./PRIVACY.md">Privacy Policy</a>
    ·
    <a href="./CHANGELOG.md">Changelog</a>
  </p>
</div>

---

**Bookmark Otter** turns cluttered browser bookmarks into a clean, searchable library right inside Chrome's Side Panel. Describe how you want your folders structured and review a full diff plan before touching a single bookmark.

Every feature is **free and open source** — no pro plan, no trial, no ads, no account.

## ✨ Highlights

### 🤖 AI Copilot & Reorganization

- Describe what you want in natural language (_"Merge design folders into UI/UX"_, _"Clean up verbose titles"_), or start from a one-click **Quick Recipe**.
- Pick a proven folder methodology (**PARA**, **Hot-Warm-Cold**, **Johnny.Decimal**, **Verb-based**, **Role & Persona**, **Shallow Taxonomy**) or define a **Custom** folder template.
- `@mention` folders to target specific areas or protect folders from changes.
- Preview every move, rename, new folder, and removal in an interactive diff tree and untick anything you don't want.
- Built-in **Try 50 links first** quota-safe preview, automatic checkpoint/resume on rate limits, and **1-click Undo** with full local snapshots.
- **Bring Your Own Key (BYOK)** support for **Google Gemini, OpenAI, Anthropic, xAI, Groq, and DeepSeek**.

### 📥 Inbox: Zero-Effort Triage

- Your latest unorganized bookmarks appear in the **Inbox**.
- One click gives you an AI-suggested clean title and target folder — edit inline or apply immediately.

### 🩺 Bookmark Doctor & Library Insights

Run a complete health check-up with a live score out of 100:

- **Duplicates:** Find exact copies across folders and choose which copy to keep.
- **Similar Links:** Spot near-identical pages and compare or bulk-clean them.
- **Tracking Cleaner:** Strip `utm_`, `fbclid`, `gclid`, site-specific junk, and optional affiliate tags with a before/after diff preview.
- **HTTP → HTTPS:** Upgrade insecure `http://` links only where HTTPS is verified to work.
- **404 & Dead Link Checker:** Concurrently verify reachability (`404`, `5xx`, timeouts) with domain grouping and live progress.
- **Empty Folders:** Sweep orphaned, empty folders in one click.
- **Insights & Export:** Inspect largest folders, top domains, bookmark age distribution, and busiest months. Export domains as **CSV** or your full report as **JSON**.

### 🗂 Library Explorer, Recycle Bin & Polish

- **Tree & Notion-Style Table:** Flip between your folder hierarchy and a fast flat table with instant title, domain, and folder search.
- **30-Day Recycle Bin:** Every deleted bookmark or folder lands in a local Recycle Bin first with one-click restore.
- **Adaptive Themes & Languages:** Light/Dark/System themes with zero FOUC, plus **English** and **Turkish** UI.

---

## 🔒 Your Key, Your Data

- **No backend, no account, no telemetry:** API keys, settings, undo snapshots, and Recycle Bin backups live exclusively in your browser's local storage.
- **User-initiated AI calls only:** When you trigger an AI feature, bookmark metadata (titles, URLs, and folder names) is sent directly from your browser to your selected AI provider.
- **Transparent permissions:**
  - `bookmarks` — Read and organize your bookmarks and folders.
  - `sidePanel` — Display Bookmark Otter inside Chrome's Side Panel.
  - `storage` — Save your preferences, API key, Undo snapshots, and Recycle Bin locally.
  - `tabs` & `scripting` — Open selected links in tabs and (only if optional site access is granted) read brief page metadata (`<meta description>` / `<h1>`) on newly starred tabs.
  - `optional_host_permissions` (`http://*/*`, `https://*/*`) — Requested on demand only when you run Doctor's **404** or **HTTPS** checks, and revocable anytime in Settings.

Read the full details in [PRIVACY.md](./PRIVACY.md).

---

## 📦 Install

### Option 1: Chrome Web Store (Recommended)

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/bookmark-otter-%E2%80%93-ai-bookm/pdnpmlfkbepngbgacjgeobigmpchlimc).

### Option 2: Build from Source

#### Prerequisites

- [Bun](https://bun.sh) (recommended) or [Node.js](https://nodejs.org) (v20+)

#### Clone, Install & Run

```bash
git clone https://github.com/agmmnn/bookmark-otter.git
cd bookmark-otter
bun install
bun dev
```

#### Load Unpacked in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `.output/chrome-mv3`.
4. Click the Bookmark Otter toolbar icon to open the Side Panel.

#### Production Build & Package

```bash
bun run build
bun run zip
```

Artifacts are written to `.output/chrome-mv3` and `.output/bookmark-otter-<version>-chrome.zip`.

---

## 🛠 Tech Stack

| Layer              | Technology                                                                                                                                               |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**      | [WXT](https://wxt.dev) (Vite-based Web Extension Framework)                                                                                              |
| **Manifest**       | Chrome Extensions Manifest V3 (`sidePanel` API, Chrome 114+)                                                                                             |
| **UI Library**     | [React 19](https://react.dev)                                                                                                                            |
| **Styling**        | [Tailwind CSS v4](https://tailwindcss.com) + [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css)                                             |
| **Components**     | [shadcn/ui](https://ui.shadcn.com) & [Base UI](https://base-ui.com)                                                                                      |
| **AI Integration** | [Vercel AI SDK v7](https://sdk.vercel.ai) (`@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/xai`, `@ai-sdk/groq`, `@ai-sdk/deepseek`)   |
| **Icons**          | [Lucide React](https://lucide.dev)                                                                                                                       |
| **Tooling**        | [Oxc](https://oxc.rs) ([Oxlint](https://oxc.rs/docs/guide/usage/linter.html) & [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)) + TypeScript 5.9 |

---

## 🧰 Scripts

| Script              | Command                 | Purpose                                                            |
| :------------------ | :---------------------- | :----------------------------------------------------------------- |
| `dev`               | `bun dev`               | Start Chrome dev server with live reload                           |
| `build`             | `bun run build`         | Production build for Chrome MV3                                    |
| `build:firefox`     | `bun run build:firefox` | Production build for Firefox MV2                                   |
| `zip`               | `bun run zip`           | Create Chrome Web Store `.zip` package                             |
| `compile`           | `bun run compile`       | Typecheck with `tsc --noEmit`                                      |
| `lint`              | `bun run lint`          | Lint codebase with Oxlint                                          |
| `fmt` / `fmt:check` | `bun run fmt`           | Format or verify formatting with Oxfmt                             |
| `release`           | `bun run release:patch` | Bump version, tag, and trigger GitHub Actions release + CWS upload |

---

## 📄 License

Distributed under the [MIT License](./LICENSE).
