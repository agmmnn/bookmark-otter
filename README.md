<div align="center">
  <img src="./assets/logo.png" width="96" alt="Bookmark Otter Logo" style="border-radius: 20px; margin-bottom: 12px;" />
  <h1>Bookmark Otter</h1>

  <p>
    <a href="https://chrome.google.com/webstore" target="_blank" rel="noopener noreferrer">
      <img src="https://shieldcn.dev/badge/Chrome%20Web%20Store.svg?size=xs&theme=blue&logo=chromewebstore" alt="Chrome Web Store" />
    </a><picture><source media="(prefers-color-scheme: dark)" srcset="https://www.shieldcn.dev/github/release/agmmnn/bookmark-otter.svg?size=xs&amp;mode=dark"><img alt="Release" src="https://www.shieldcn.dev/github/release/agmmnn/bookmark-otter.svg?size=xs&amp;mode=light"></picture>
    <img src="https://shieldcn.dev/badge/Manifest-V3.svg?size=xs&theme=emerald" alt="Manifest V3" />
    <picture><source media="(prefers-color-scheme: dark)" srcset="https://www.shieldcn.dev/github/license/agmmnn/bookmark-otter.svg?variant=ghost&amp;size=xs&amp;mode=dark"><img alt="License" src="https://www.shieldcn.dev/github/license/agmmnn/bookmark-otter.svg?variant=ghost&amp;size=xs&amp;mode=light"></picture>
  </p>

  <p><strong>Smart, AI-powered bookmark manager & health suite for Google Chrome.</strong></p>

</div>

**Bookmark Otter** transforms cluttered browser bookmarks into an organized, high-performance knowledge base right inside your Chrome Side Panel.

## ✨ Highlights

- 🤖 **AI Copilot & Natural Reorganization**
  Reorganize messy folders with natural prompts (_e.g., "Merge design folders into UI/UX", "Clean up temporary links"_). Multi-provider BYOK support for Google Gemini, OpenAI (GPT-4o), Anthropic (Claude 3.7), xAI (Grok), Groq, and DeepSeek with compact tree diff previews.

- 🩺 **Bookmark Doctor (Hygiene Suite)**
  - **Duplicates:** Detect redundant bookmarks across directories. Choose to keep newest or oldest with 1-click deduplication.
  - **404 & Dead Links:** Concurrently check link reachability (`HTTP 404`, timeouts, server errors) with real-time status badges and live progress bar removal.
  - **Empty Folders:** Sweep orphaned, empty folder structures instantly.

- ⚡ **Notion-Style Flat Explorer & Tree**
  Effortlessly switch between a hierarchical tree view and a searchable Notion-like flat table. Features creation date tracking, bidirectional chronological sorting, fast domain search, and instant actions.

- ♻️ **30-Day Safe Recycle Bin & 1-Click Undo**
  Accidental deletions? Everything moves to an isolated local Recycle Bin with an automated 30-day retention countdown and immediate 1-click restore.

- 🌓 **Adaptive Dark Mode**
  Full dark and light theme support built with shadcn/ui and Base UI primitives. Zero flash of unstyled content (FOUC) and automatic system preference synchronization.

- 🔒 **100% Private (BYOK)**
  All bookmark operations and API keys remain strictly local in `chrome.storage.local`. No external tracking servers, no telemetry, no account required.

---

## 🚀 Quickstart

### Prerequisites

- [Bun](https://bun.sh) (recommended) or [Node.js](https://nodejs.org) (v20+)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/bookmark-otter.git
cd bookmark-otter
bun install
```

### 2. Development

Run the extension in development mode with hot-reloading:

```bash
bun dev
```

### 3. Load in Google Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the `.output/chrome-mv3` directory.
4. Click the extension icon in the toolbar or open Chrome Side Panel.

### 4. Production Build

```bash
bun run build
```

The production-ready extension package will be generated in `.output/chrome-mv3`.

---

## 🛠 Tech Stack

| Layer              | Technology                                                                                                                                               |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**      | [WXT](https://wxt.dev) (Vite-based Next-gen Web Extension Framework)                                                                                     |
| **Manifest**       | Chrome Extensions Manifest V3 (Side Panel API)                                                                                                           |
| **UI Library**     | [React 19](https://react.dev)                                                                                                                            |
| **Styling**        | [Tailwind CSS v4](https://tailwindcss.com) + [tw-animate-css](https://github.com)                                                                        |
| **Components**     | [shadcn/ui](https://ui.shadcn.com) & [Base UI](https://base-ui.com)                                                                                      |
| **AI Integration** | [Vercel AI SDK v7](https://sdk.vercel.ai) (`@ai-sdk/google`, `@ai-sdk/openai`, etc.)                                                                     |
| **Icons**          | [Lucide React](https://lucide.dev)                                                                                                                       |
| **Tooling**        | [Oxc](https://oxc.rs) ([Oxlint](https://oxc.rs/docs/guide/usage/linter.html) & [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)) + TypeScript 5.9 |

---

## 📦 Scripts

| Script      | Command             | Purpose                                   |
| :---------- | :------------------ | :---------------------------------------- |
| `dev`       | `bun dev`           | Start development server with live reload |
| `build`     | `bun run build`     | Build extension for Chrome MV3            |
| `compile`   | `bun run compile`   | Typecheck TypeScript codebase             |
| `lint`      | `bun run lint`      | Fast linting via Oxlint                   |
| `lint:fix`  | `bun run lint:fix`  | Automatically fix linting issues          |
| `fmt`       | `bun run fmt`       | Format codebase via Oxfmt                 |
| `fmt:check` | `bun run fmt:check` | Check code formatting via Oxfmt           |

---

## 📄 License

Distributed under the [MIT License](LICENSE).
