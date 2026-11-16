# Changelog

All notable changes to **Bookmark Otter** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-17

Initial public release prepared for Chrome Web Store (`chrome-mv3`), with cross-browser builds for `firefox-mv2` and `safari-mv2`.

### Added

- **4-Tab Container-Responsive Navigation:** Streamlined main bar (`Inbox`, `Library`, `Copilot`, `Doctor`) with 3-stage `container-type: inline-size` adaptation (full labels → active-only label → icon-only) and header **Recycle Bin** & **Settings** full-page views with Back navigation.
- **Inbox (`RecentBookmarks`):**
  - Default landing view for triaging unorganized recent bookmarks.
  - Multi-select checkboxes with top-level **Organize all (N)** / **Organize selected (K)** batch action and hover-only per-row **AI Organize** buttons.
  - Middle-truncated folder paths with full-path tooltips.
- **Library (`Explorer`):**
  - Dual **Tree** and Notion-style **Flat Table** views with instant search, special filter tokens (`is:loose`, `is:single-domain`), chronological sorting, URL copy, and Recycle Bin deletion with 1-click **Undo**.
- **AI Copilot & Multi-Step Agent Harness:**
  - Natural language bookmark reorganization supporting single-shot scoped requests and multi-step **Agent Harness** execution (`Architect → Router → Aggregator`) for 1,000+ bookmark libraries, with live progress and a **Stop** button (`AbortController`).
  - Support for `@mention` targeting of both **folders** and **individual bookmarks**, protected-folder exclusion directives (e.g. `do not touch @"Folder"`), and safe abort on unmatched `@mentions`.
  - Downward-opening `@ Target` autocomplete dropdown, **Quick Recipes** (4 primary + `More`), collapsible **Architecture Methodologies** presets (PARA, Hot-Warm-Cold, Johnny.Decimal, Verb-Based, Role & Persona, Shallow Taxonomy) usable as style presets, and searchable **Mention a folder** quick-insert chips.
  - Interactive **DiffPreview** with filter tabs (`All`, `Moves`, `New Folder`, `Renames`, `Removes`), per-item/per-folder checkboxes, Raw AI JSON/DSL inspector, and automatic backup snapshots for 1-click Undo.
- **Bookmark Doctor & Overview:**
  - Integrated **Overview** hub displaying a unified Health Score ring, clickable score deductions, 6 live diagnostic issue cards, and collapsible analytics (**Library Facts**, **Bookmark Age Distribution**, **Largest Folders**, **Top Domains**, **Share & Export** to CSV/JSON/summary).
  - **Duplicates:** Keep-newest deduplication with Title, Date, Short Path, and Full URL details plus confirmation & Undo.
  - **Similar Bookmarks:** Overlapping URL/title grouping with batch selection, Open in Tabs, and Delete.
  - **Tracking Parameters:** Live count & green Before → After URL preview for stripping `utm_*`, `fbclid`, `gclid`, platform trackers, and optional affiliate tags.
  - **Insecure HTTP:** Search/pagination, live **Verify HTTPS** reachability checks, and verified batch HTTPS upgrades.
  - **404 Broken Links:** Concurrent background link checker (`HEAD` with `GET` fallback) separating CORS/bot-blocked sites into **Unverified** (excluded from bulk removal for safety).
  - **Empty Folders:** Safe detection and cleanup backed up to Recycle Bin.
- **Full-Page Settings (`AI`, `Appearance`, `Data`):**
  - Multi-provider BYOK support for **Google Gemini**, **OpenAI**, **Anthropic Claude**, **xAI Grok**, **Groq**, and **DeepSeek** with per-provider key storage, live **Test** connection verification, updated curated model lists, and an in-dropdown **Custom model…** option.
  - Separate **Interface language** (`English` / `Türkçe`) and **AI response language** (`Auto (same as request)` / `English` / `Türkçe`), plus 3-way **Theme** selector (`System` / `Light` / `Dark`).
  - Configurable **Trash retention** (`7` / `14` / `30` / `90` days), settings JSON export/import, **Clear all local data**, and on-demand optional web-scan permission revoke control.
- **Privacy & Security Hardening:**
  - Added [`PRIVACY.md`](PRIVACY.md) and narrowed `host_permissions` exclusively to the 6 supported AI provider API endpoints; general website checks (`404 Links` & `Verify HTTPS`) use `optional_host_permissions` (`http://*/*`, `https://*/*`) requested only on user action.
  - Eliminated MV3 CSP inline scripts via external `/theme-init.js`, removed boilerplate content scripts and unused `alarms` permission.
- **Bundle & Performance Optimization:**
  - Isolated AI SDK execution inside the background service worker (`~920 KB` saved), replaced heavy logo assets with `icon/48.png`, subset Geist fonts to `latin`/`latin-ext`, and lazy-loaded sidepanel tabs cleanly (`~1.97 MB` unpacked, `~603 KB` Chrome Web Store `.zip`).
