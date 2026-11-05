# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-05

### Added
- Redesigned library: card grid and dense list views, light/dark/auto theme, sort (newest, oldest, title, site), and keyboard navigation (`/` to search, arrows, Enter, Delete).
- Folders: create, rename, delete (clips become unfiled), and move clips between folders.
- Tags: add tags to clips, filter by one or more tags from the tag cloud.
- Notes and text highlights in a slide-over reader; highlights are kept separately from the clipped HTML.
- Delete with a short undo instead of a confirmation dialog.
- Backup and import: export everything (clips and folders) as a JSON backup, and import a backup with a preview. Existing clips are never overwritten. Old 1.0 exports import too. Local files only, nothing leaves the device.

### Changed
- Local database upgraded to version 2 (adds a folders store). Existing clips are kept as they are.
- Unit tests for the library model (filtering, sorting, tags, import and backup).

## [1.0.0] - Unreleased

### Added
- In-page content picker: auto-detects the main content, dims the rest, and lets you grow/shrink the region with + / − or click to move it.
- Multi-select mode to add blocks, remove blocks, or cut a part out of a selected region.
- Clip formats: Article, Multi-select, Full page, and Selection.
- Local library page with search, preview, delete, and per-clip Markdown/HTML export plus whole-library JSON export.
- Right-click menu (picker and quick clips) and the `Alt+Shift+C` shortcut.
- "Open library" when you right-click the toolbar icon, so the library is reachable from any page.
- Article and multi-select clips leave out content the page never shows (closed menus, dialogs, hidden notes).
- Unit tests for extraction and Markdown export.
