# Clipper Lite

A free, open-source Chrome extension that clips the part of a web page you care about into a **private library on your own device**. No account, no server, no tracking.

> Clipper Lite is a working name and may change before the 1.0 store release.

## Features

- **Smart content detection.** Click the toolbar button and the main content of the page is outlined while the rest is dimmed.
- **Adjust what you save.**
  - **Article:** grow or shrink the outlined region with **+ / −**, or click any block to move it.
  - **Multi-select:** click blocks to add them, click a selected block to remove it, or click inside a selected block to cut that part out.
  - **Full page:** the whole page with its styles.
  - **Selection:** exactly the text you highlighted.
- **Local library.** Browse and search everything you've clipped in a built-in library page.
- **Export anywhere.** Download a clip as Markdown (with front matter) or standalone HTML, or export your whole library as JSON.
- **Right-click quick clips** and a keyboard shortcut (`Alt+Shift+C`, changeable at `chrome://extensions/shortcuts`).
- **Minimal permissions.** It only touches a page when you ask it to.

## Install

- **Chrome Web Store:** _link coming soon_
- **From source:**
  1. `git clone https://github.com/samma89/webclipper-lite.git`
  2. Open `chrome://extensions` and enable **Developer mode**.
  3. Click **Load unpacked** and select the cloned folder.

## Usage

1. Open a page and click the Clipper Lite icon (or press `Alt+Shift+C`).
2. Pick a clip format in the side panel and adjust the outlined region if needed.
3. Click **Save clip**, then **Open library** to view it. You can also open the library any time by right-clicking the toolbar icon.

Pages the browser protects (`chrome://`, the Chrome Web Store, the PDF viewer) can't be clipped.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the current page only after you click the button, use the shortcut, or pick a menu item. |
| `scripting` | Inject the picker and extraction code into that page. |
| `contextMenus` | The right-click "Clip with picker…" and quick-clip items. |
| `unlimitedStorage` | Full-page clips can be several megabytes, so the library isn't capped at the default quota. |

There are no host permissions and no network requests. See [PRIVACY.md](PRIVACY.md).

## Development

```bash
npm install        # installs jsdom for the tests
npm test           # unit tests for extraction and Markdown export
npm run package    # builds dist/webclipper-lite-v<version>.zip for the Web Store
```

No build step: the extension runs straight from the source files.

```
manifest.json        MV3 manifest
background.js        toolbar click, context menus, saving clips
src/extract.js       content detection and extraction (injected into the page)
src/picker.js        in-page picker UI (injected into the page)
src/clip.js          quick-clip flow used by the right-click menu
src/db.js            IndexedDB storage
src/markdown.js      HTML to Markdown for exports
library/             the library page
test/                node:test + jsdom
scripts/package.mjs  store zip builder
```

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
