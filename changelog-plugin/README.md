# Changelog & Documentation — Figma Plugin

A Figma plugin that scans your design files for changes, publishes changelogs to Confluence, and generates announcement posts.

## Features

### Scan
Reads all pages in the current Figma file and categorizes top-level frames as:
- **Added** — new components, frames tagged `[new]` or `[added]`
- **Updated** — modified instances, frames tagged `[update]` or `[updated]`
- **Fixed** — frames tagged `[fix]` or `[fixed]`
- **Removed** — frames tagged `[removed]` or `[deprecated]`

Supports filtering by time range (7 / 5 / 1 days).

### Publish
Pushes the scanned changelog to a Confluence page via REST API. Content is formatted as categorized tables with page names, component names, and dates.

### Announcement
Generates a max 350-character summary post with emojis highlighting the top updates, ready to paste into Slack or Teams.

## Setup

### 1. Install as a dev plugin in Figma

1. In Figma, go to **Plugins > Development > Import plugin from manifest...**
2. Select `changelog-plugin/manifest.json`

### 2. Configure credentials

Open the plugin and click the settings gear icon. You need:

| Field | Where to get it |
|---|---|
| **Email** | Your Atlassian account email |
| **Confluence API key** | Generate at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

Credentials are stored locally via `figma.clientStorage` — they never leave your machine.

### 3. Start the CORS proxy (required for dev plugins)

Figma dev plugins run in a sandboxed `data:` URI iframe, which causes CORS failures when calling the Confluence API directly. A local proxy is included to handle this:

```bash
node proxy-server.js
```

The proxy runs on `http://localhost:3001` and forwards requests to `*.atlassian.net` with proper CORS headers. Keep it running while using the plugin.

> **Note:** This proxy is only needed during development. Published Figma plugins use Figma's built-in network proxy, which handles CORS automatically.

## Publishing to Confluence

1. Scan your file first (Scan tab > Rescan)
2. Go to the **Publish** tab
3. Paste your Confluence page URL (supports `/pages/12345`, `/pages/edit-v2/12345`, and draft URLs)
4. Click **Publish to confluence**

The page must be published in Confluence (not just a draft) for the API to find it.

## Project structure

```
changelog-plugin/
  manifest.json       # Figma plugin manifest
  code.js             # Plugin sandbox (page scanning, clientStorage)
  ui.html             # Plugin UI (tabs, Confluence publishing, announcements)
  proxy-server.js     # Local CORS proxy for development
  src/                # TypeScript sources
    code.ts
    ui.ts
    ui.html
  scripts/
    build-ui.js       # Inlines JS bundle into HTML
  package.json
```

## Development

```bash
npm install
npm run watch       # Watch mode for code.ts and ui.ts
node proxy-server.js  # Start CORS proxy in a separate terminal
```

Then import the manifest in Figma and use **Plugins > Development > Changelog & documentation**.

## Tagging conventions

Add tags to frame names to control categorization:

| Tag | Category |
|---|---|
| `[new]`, `[added]` | Added |
| `[update]`, `[updated]` | Updated |
| `[fix]`, `[fixed]` | Fixed |
| `[removed]`, `[deprecated]` | Removed |

Frames without tags are categorized by node type: `COMPONENT` / `COMPONENT_SET` = Added, `INSTANCE` = Updated, everything else = Updated.
