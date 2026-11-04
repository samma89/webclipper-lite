# Chrome Web Store listing

Copy-paste material for the developer dashboard.

## Basics

- **Name:** Clipfolio
- **Category:** Productivity
- **Language:** English
- **Summary (max 132 chars):** Clip the part of a page that matters into a private library on your device. Free, open source, no account.

## Detailed description

Clip what matters from any web page and keep it on your own device.

Click the toolbar button and Clipfolio finds the main content of the page, outlines it, and dims the rest. Grow or shrink the selection with + and −, or switch to Multi-select to add and remove exactly the blocks you want. Then save.

FEATURES
• Smart detection of the main article or content
• Article, Multi-select, Full page, and Selection clip formats
• A built-in library with search and preview, one right-click away on the toolbar icon
• Export any clip as Markdown or HTML, or export everything as JSON
• Right-click menu and a keyboard shortcut (Alt+Shift+C)

PRIVATE BY DESIGN
• No account, no server, no analytics
• Clips are stored only in your browser
• Works only on the page you choose, only when you ask

FREE AND OPEN SOURCE
Source code: https://github.com/samma89/webclipper-lite (MIT license)

## Single purpose

Clip the content of the current web page and save it to a local library.

## Permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Access the current page only after the user clicks the toolbar button, uses the shortcut, or picks a context-menu item, so the page's content can be read and clipped. |
| `scripting` | Inject the content picker and extraction code into the active page on demand. |
| `contextMenus` | Provide "Clip with picker…" and quick-clip items in the right-click menu, and "Open Clipfolio library" when the toolbar icon is right-clicked. |
| `unlimitedStorage` | Full-page clips and images can exceed the default storage quota; clips are stored locally in IndexedDB. |

No host permissions are requested.

## Data usage disclosures (Privacy practices tab)

- Does the extension collect user data? **No.** Clips are stored locally and never transmitted.
- Check none of the data-type boxes (personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity, website content). Website content is processed locally on the device only and is not collected or transmitted.
- Certify all three statements: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.
- **Remote code:** No, the extension does not use remote code.
- **Privacy policy URL:** https://github.com/samma89/webclipper-lite/blob/main/PRIVACY.md

## Assets checklist

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | Ready: `icons/icon128.png` |
| Screenshots | 1280×800 (1-5) | todo: capture the picker, multi-select, and library |
| Small promo tile | 440×280 | todo |
| Marquee promo tile | 1400×560 | optional |
