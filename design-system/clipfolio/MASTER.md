# Clipfolio library v1.1: design + data contract

Source of truth for the library makeover. Generated with ui-ux-pro-max (`--design-system`), then adjusted to the Clipfolio brand (see "Deviations").

## Style
Minimalism / Swiss: clean, spacious, grid-based, high contrast, functional. Subtle motion (150-250ms, ease-out), no heavy shadows, no emoji icons (inline SVG only, `aria-hidden` when decorative, labelled when icon-only).

## Tokens (CSS custom properties; light, dark via `prefers-color-scheme` + manual `data-theme` override)
| token | light | dark |
|---|---|---|
| --bg | #F7F7FB | #121317 |
| --surface (cards, panes) | #FFFFFF | #1A1C22 |
| --surface-2 (hover, inputs) | #EFEFF7 | #23262E |
| --fg | #14151A | #ECEDF1 |
| --muted | #5B5F6B | #A0A5B1 |
| --border | #E1E2EC | #2E313B |
| --primary (brand indigo) | #4338CA | #8B83F5 |
| --on-primary | #FFFFFF | #0F0E26 |
| --accent (brand mint) | #10B981 | #34D399 |
| --danger | #B91C1C | #F87171 |
| --highlight | #FEF08A | #854D0E (text stays --fg) |
Radii 12 (cards) / 8 (controls). Spacing scale 4/8/12/16/24/32. Type: system-ui stack (brand rule: system sans; extensions must not load remote fonts), base 15px/1.5, titles 600, tight tracking on headings. Reading pane uses serif stack at 18px/1.65, max-width 42rem.

## Deviations from the generated system
Generated palette was amber/blue; replaced with brand indigo + mint (branding/README.md). Generated font was Plus Jakarta Sans; replaced with system sans (no remote fonts in an MV3 extension, brand rule).

## Layout
- Top bar: logo+name, global search (`/` focuses it), view toggle (grid/list, `aria-pressed`), sort select (Newest, Oldest, Title, Site), theme toggle (auto/light/dark), "Import" and "Export" buttons (menu).
- Left rail (collapsible <900px): "All clips", "Unfiled", folder list (with counts, add/rename/delete), tag cloud (click to filter, multi-select = AND).
- Main: responsive card grid (`repeat(auto-fill, minmax(260px, 1fr))`), cards show favicon+site, title (2 lines clamp), excerpt (3 lines), tag chips, date, note indicator. List mode = dense rows. Selection via click/Enter opens reader.
- Reader: slide-over pane (right, 50-60% width, full width <900px) with sticky header (title, source link, folder select, Markdown / HTML / Delete), tag editor, article in sandboxed iframe, notes textarea, highlights list. Esc closes; focus returns to the originating card.
- Empty states: no clips, no search results, empty folder, each with a clear next action.
- Delete uses an inline undo toast (8s) instead of `confirm()`.

## Accessibility / interaction rules
Contrast >= 4.5:1 both themes; visible `:focus-visible` ring (2px --primary, 2px offset); full keyboard use (grid is a roving-tabindex listbox, arrows move, Enter opens, Delete removes with undo); touch targets >= 36px (desktop extension page, 44px under 700px); `prefers-reduced-motion` disables transitions; `aria-live="polite"` region for toasts and result counts; labels on every input; never rely on color alone (highlight has underline offset style too).

## Data model (IndexedDB `clipper-lite`, bump to **version 2**, never rename DB)
Clip (existing fields unchanged: id, createdAt, url, title, siteName, byline, excerpt, mode, html, ...) gains optional fields, absent = default:
- `folderId: string|null`
- `tags: string[]` (lowercase, trimmed, max 40 chars, deduped)
- `note: string` (plain text, user note)
- `highlights: {id, text, color:'yellow', createdAt}[]` (text anchored by quoted text; re-applied on render by wrapping first matching text node run, no DOM offsets)
- `updatedAt: number`
New store `folders` keyPath `id`: `{id, name, createdAt}`. v1 -> v2 upgrade only creates the `folders` store and a `folderId` index on clips if desired; existing clips need no rewrite (all new fields optional).

## Module contract (agents must match these exact exports)
`src/db.js` (keeps existing exports `putClip,getClip,deleteClip,countClips,listClips`) adds:
`listFolders()`, `putFolder(folder)`, `deleteFolder(id)` (clips in it become `folderId:null`, in one transaction), `updateClip(id, patch)` (merges patch, sets `updatedAt`, returns clip), `putClips(clips)` (bulk, single tx).
`src/library-model.js` (pure, no DOM, unit-tested with node:test):
`normalizeTag(s)`, `allTags(clips)` -> `[{tag,count}]` sorted by count desc, `filterClips(clips,{query,folderId,tags})` (folderId: `undefined`=all, `null`=unfiled; tags AND; query matches title/url/excerpt/tags/note), `sortClips(clips,key)`, `mergeImport(existing, incoming)` -> `{toAdd, skippedDuplicates, invalid}` (dedupe by id, then by url+createdAt; validates required fields id/title/url/html/createdAt; never overwrites), `parseBackup(jsonText)` -> `{clips, folders}` accepting both the old v1 export (bare array of clips) and new `{format:'clipfolio-backup', version:2, exportedAt, clips, folders}`, `buildBackup(clips, folders)`.
Backup/import is the "sync" feature for v1.1: file-based, local only, no network (privacy policy stays valid). Cross-device cloud sync is explicitly out of scope until the privacy policy is revisited.

## Out of scope
Remote sync, accounts, new permissions in manifest.json (the library page needs none beyond what exists), changes to the picker.
