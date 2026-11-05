import {
  listClips, deleteClip, putClip, listFolders, putFolder, deleteFolder, updateClip, putClips,
} from '../src/db.js';
import {
  normalizeTag, allTags, filterClips, sortClips, mergeImport, parseBackup, buildBackup,
} from '../src/library-model.js';
import { clipToMarkdown } from '../src/markdown.js';

/* ------------------------------------------------------------------ helpers */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtShort = (ms) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
const slug = (s) => (s || 'clip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'clip';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const collapseWs = (s) => String(s).replace(/\s+/g, ' ').trim();
const safeHref = (u) => (/^https?:\/\//i.test(String(u)) ? String(u) : null);

// Build DOM without innerHTML so user strings can only ever become text.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

// Static, trusted SVG strings only (never built from user data).
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  mark: '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  all: '<path d="M4 4h16v16H4z"/><path d="M4 9h16"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
function icon(name) {
  const s = document.createElement('span');
  s.setAttribute('aria-hidden', 'true');
  s.style.display = 'inline-flex';
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return s;
}
function setIcon(btn, name) { btn.replaceChildren(icon(name)); }

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const store = {
  get(k, d) { try { return localStorage.getItem(`clipfolio.${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`clipfolio.${k}`, v); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------ export (kept) */

// Article and selection clips are fragments, so wrap them in a readable page.
// Full-page clips are already complete documents.
function standaloneHtml(clip) {
  if (clip.mode === 'fullpage') return clip.html;
  const byline = [clip.byline, clip.siteName, fmtDate(clip.createdAt)].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8">${safeHref(clip.url) ? `<base href="${esc(clip.url)}" target="_blank">` : ''}
<title>${esc(clip.title)}</title>
<style>
  html { font-size: 18px; } body { font: 1rem/1.65 Georgia, serif; max-width: 42rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #222; }
  h1 { font: 700 2rem/1.25 system-ui, sans-serif; margin-bottom: .25rem; }
  .meta { font: 14px system-ui, sans-serif; color: #666; margin-bottom: 2rem; }
  img { max-width: 100%; height: auto; }
  pre { overflow: auto; background: #f5f5f5; padding: .75em; font-size: 14px; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 4px 8px; }
</style></head><body>
<h1>${esc(clip.title)}</h1><div class="meta">${byline}</div>
${clip.html}
</body></html>`;
}

/* -------------------------------------------------------------- highlights
 * Design (the safest approach that works):
 *  - The reader iframe is sandboxed WITHOUT allow-scripts, so clipped HTML can never
 *    execute code (inline handlers, <script>, javascript: URLs are all dead). The
 *    extension CSP (script-src 'self') is also inherited by srcdoc as a second layer.
 *  - allow-same-origin is added solely so this page can read the iframe's selection via
 *    iframe.contentWindow.getSelection(). That is only reasonably safe because scripts
 *    can't run inside the frame; never combine the two flags.
 *  - Highlights are NOT written into the stored clip HTML. At render time we parse the
 *    standalone HTML with DOMParser (inert: no scripts run, no resources load), wrap the
 *    first occurrence of each quoted text in <mark>, serialize, and use the result as the
 *    srcdoc string. Anchoring is by quoted text (whitespace-collapsed), not DOM offsets,
 *    so it survives re-renders. Exports use the untouched standaloneHtml().
 */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE', 'HEAD', 'TITLE']);
const HL_CSS = 'mark.clf-hl{background:#FEF08A;color:#14151A;text-decoration:underline;text-decoration-style:wavy;text-decoration-color:#a16207;text-underline-offset:3px;border-radius:2px}';

function textIndex(doc) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      for (let p = n.parentNode; p && p !== doc.body; p = p.parentNode) if (SKIP_TAGS.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let norm = '';
  const map = []; // normalized char index -> [node, offset]
  let lastSpace = true;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue;
    for (let i = 0; i < t.length; i++) {
      if (/\s/.test(t[i])) {
        if (lastSpace) continue;
        norm += ' '; map.push([n, i]); lastSpace = true;
      } else {
        norm += t[i]; map.push([n, i]); lastSpace = false;
      }
    }
  }
  return { norm, map };
}

function wrapHighlight(doc, hl) {
  const needle = collapseWs(hl.text);
  if (!needle) return false;
  const { norm, map } = textIndex(doc);
  const start = norm.indexOf(needle);
  if (start < 0) return false;
  const spans = new Map(); // node -> [minOffset, maxOffset]
  for (let i = start; i < start + needle.length; i++) {
    const [node, off] = map[i];
    const s = spans.get(node);
    if (s) { s[0] = Math.min(s[0], off); s[1] = Math.max(s[1], off); } else spans.set(node, [off, off]);
  }
  for (const [node, [a, b]] of spans) {
    if (!node.nodeValue.slice(a, b + 1).trim()) continue; // skip whitespace-only runs between blocks
    const r = doc.createRange();
    r.setStart(node, a);
    r.setEnd(node, b + 1);
    const mark = doc.createElement('mark');
    mark.className = 'clf-hl';
    mark.setAttribute('data-hl-id', String(hl.id));
    r.surroundContents(mark);
  }
  return true;
}

function buildSrcdoc(clip) {
  const html = standaloneHtml(clip);
  const hls = Array.isArray(clip.highlights) ? clip.highlights : [];
  const found = new Set();
  if (!hls.length) return { srcdoc: html, found };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const hl of hls) {
    try { if (wrapHighlight(doc, hl)) found.add(hl.id); } catch { /* unlocatable: leave unmarked */ }
  }
  const style = doc.createElement('style');
  style.textContent = HL_CSS;
  (doc.head || doc.documentElement).append(style);
  return { srcdoc: `<!doctype html>${doc.documentElement.outerHTML}`, found };
}

/* -------------------------------------------------------------------- state */

let clips = [];
let folders = [];
const filter = { query: '', folderId: undefined, tags: new Set() }; // folderId: undefined=all, null=unfiled
let sortKey = store.get('sort', 'newest');
let viewMode = store.get('view', 'grid');
let theme = store.get('theme', 'auto');
let focusedId = null;     // roving tabindex target
let openId = null;        // clip shown in reader
let originId = null;      // card to refocus on close
let addingFolder = false;
let renamingFolderId = null;
let foundHighlights = new Set();
let pendingScroll = 0;
let pendingHl = null;

const grid = $('#grid');
const viewer = $('#viewer');
const reader = $('#reader');
const getClipById = (id) => clips.find((c) => c.id === id);

function visibleClips() {
  const filtered = filterClips(clips, { query: filter.query, folderId: filter.folderId, tags: [...filter.tags] });
  return sortClips(filtered, sortKey);
}

function replaceClip(updated) {
  const i = clips.findIndex((c) => c.id === updated.id);
  if (i >= 0) clips[i] = updated; else clips.push(updated);
}

async function patchClip(id, patch) {
  const updated = await updateClip(id, patch);
  if (updated) replaceClip(updated);
  else { const c = getClipById(id); if (c) Object.assign(c, patch); }
  return getClipById(id);
}

/* ------------------------------------------------------------------ toasts */

function toast(message, { actionLabel, onAction, timeout = 8000 } = {}) {
  const el = h('div', { class: 'toast' }, h('span', { text: message }));
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (actionLabel) {
    el.append(h('button', { class: 'btn', type: 'button', text: actionLabel, onclick: async () => { close(); await onAction?.(); } }));
  }
  el.append(h('button', { class: 'btn icon-btn', type: 'button', 'aria-label': 'Dismiss', onclick: close }, icon('close')));
  $('#toasts').append(el);
  timer = setTimeout(close, timeout);
  return close;
}

/* ------------------------------------------------------------------- render */

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

function render() {
  renderRail();
  renderGrid();
}

function folderName(id) { return folders.find((f) => f.id === id)?.name || ''; }

function renderRail() {
  const main = $('#rail-main');
  const unfiled = clips.filter((c) => !c.folderId || !folders.some((f) => f.id === c.folderId)).length;
  const link = (label, count, current, onclick, iconName) => h('li', { class: 'rail-item' },
    h('button', { class: 'rail-link', type: 'button', 'aria-current': current ? 'true' : null, onclick },
      h('span', { class: 'name' }, icon(iconName), ' ', label), h('span', { class: 'count', text: String(count) })));
  main.replaceChildren(
    link('All clips', clips.length, filter.folderId === undefined, () => setFolder(undefined), 'all'),
    link('Unfiled', unfiled, filter.folderId === null, () => setFolder(null), 'inbox'),
  );

  const list = $('#rail-folder-list');
  list.replaceChildren();
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of sorted) {
    if (renamingFolderId === f.id) { list.append(folderForm(f)); continue; }
    const count = clips.filter((c) => c.folderId === f.id).length;
    list.append(h('li', { class: 'rail-item' },
      h('button', { class: 'rail-link', type: 'button', 'aria-current': filter.folderId === f.id ? 'true' : null, 'data-folder': f.id, onclick: () => setFolder(f.id) },
        h('span', { class: 'name' }, icon('folder'), ' ', f.name), h('span', { class: 'count', text: String(count) })),
      h('span', { class: 'rail-actions' },
        h('button', { class: 'btn icon-btn', type: 'button', 'aria-label': `Rename folder ${f.name}`, onclick: () => { renamingFolderId = f.id; renderRail(); $('#rail-folder-list input')?.focus(); } }, icon('pencil')),
        h('button', { class: 'btn icon-btn', type: 'button', 'aria-label': `Delete folder ${f.name}`, onclick: () => removeFolder(f).then(() => focusFolderLink(null)) }, icon('trash')))));
  }
  if (addingFolder) list.append(folderForm(null));
  if (!folders.length && !addingFolder) list.append(h('li', { class: 'hint', text: 'No folders yet.' }));

  const tagBox = $('#rail-tag-list');
  tagBox.replaceChildren();
  const tags = allTags(clips);
  for (const { tag, count } of tags) {
    tagBox.append(h('button', { class: 'tag-btn', type: 'button', 'aria-pressed': filter.tags.has(tag) ? 'true' : 'false', onclick: () => toggleTag(tag) },
      tag, h('span', { class: 'count', text: String(count) })));
  }
  if (!tags.length) tagBox.append(h('p', { class: 'hint', text: 'Tags you add to clips show up here.' }));
}

function focusFolderLink(id) {
  const link = id && $('#rail-folder-list').querySelector(`.rail-link[data-folder="${CSS.escape(id)}"]`);
  (link || $('#folder-add')).focus();
}

function folderForm(f) {
  const input = h('input', { type: 'text', maxlength: '60', value: f ? f.name : '', placeholder: 'Folder name', 'aria-label': f ? `Rename folder ${f.name}` : 'New folder name' });
  let done = false;
  const finish = async (commit, refocus = false) => {
    if (done) return;
    done = true;
    const name = collapseWs(input.value).slice(0, 60);
        addingFolder = false; renamingFolderId = null;
    let targetId = f ? f.id : null;
    if (commit && name) {
      if (f) { f.name = name; await putFolder({ ...f }); } else {
        const nf = { id: uid(), name, createdAt: Date.now() };
        await putFolder(nf); folders.push(nf);
        targetId = nf.id;
      }
    }
    render();
    if (refocus) focusFolderLink(targetId);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false, true); }
  });
  input.addEventListener('blur', () => finish(f ? input.value !== f.name : !!input.value.trim()));
  return h('li', { class: 'rail-form' }, input);
}

async function removeFolder(f) {
  const affected = clips.filter((c) => c.folderId === f.id).map((c) => c.id);
  await deleteFolder(f.id);
  folders = folders.filter((x) => x.id !== f.id);
  for (const c of clips) if (c.folderId === f.id) c.folderId = null;
  if (filter.folderId === f.id) filter.folderId = undefined;
  render();
  if (openId) renderReaderFolder();
  toast(`Deleted folder “${f.name}”`, {
    actionLabel: 'Undo',
    onAction: async () => {
      await putFolder(f);
      folders.push(f);
      for (const id of affected) { const c = await patchClip(id, { folderId: f.id }); if (!c) continue; }
      render();
      if (openId) renderReaderFolder();
    },
  });
}

function setFolder(id) {
  filter.folderId = id;
  document.body.classList.remove('rail-open');
  $('#rail-toggle').setAttribute('aria-expanded', 'false');
  render();
}

function toggleTag(tag) {
  if (filter.tags.has(tag)) filter.tags.delete(tag); else filter.tags.add(tag);
  render();
}

function hasFilters() { return !!filter.query || filter.folderId !== undefined || filter.tags.size > 0; }

function renderGrid() {
  const shown = visibleClips();
  grid.className = viewMode === 'list' ? 'grid list' : 'grid';
  grid.setAttribute('aria-orientation', viewMode === 'list' ? 'vertical' : 'horizontal');
  grid.replaceChildren();

  if (!shown.some((c) => c.id === focusedId)) focusedId = shown[0]?.id ?? null;
  for (const clip of shown) grid.append(card(clip));

  const parts = [`${shown.length} ${shown.length === 1 ? 'clip' : 'clips'}`];
  if (filter.folderId === null) parts.push('unfiled');
  else if (filter.folderId) parts.push(`in ${folderName(filter.folderId)}`);
  if (filter.tags.size) parts.push(`tagged ${[...filter.tags].join(' + ')}`);
  if (filter.query) parts.push(`matching “${filter.query}”`);
  setResults(parts.join(' · '));
  $('#clear-filters').hidden = !hasFilters();
  renderEmpty(shown.length);
}

let resultsTimer;
let resultsFirst = true;
function setResults(text) {
  const el = $('#results');
  clearTimeout(resultsTimer);
  if (resultsFirst) { resultsFirst = false; el.textContent = text; return; }
  resultsTimer = setTimeout(() => { el.textContent = text; }, 400); // debounced so typing is not announced per keystroke
}

function renderEmpty(shownCount) {
  const box = $('#empty');
  grid.hidden = shownCount === 0;
  box.hidden = shownCount !== 0;
  if (shownCount) return;
  box.replaceChildren();
  const clear = () => { filter.query = ''; filter.folderId = undefined; filter.tags.clear(); $('#search').value = ''; render(); };
  if (!clips.length) {
    box.append(h('h2', { text: 'No clips yet' }),
      h('p', { text: 'Click the Clipfolio toolbar button on any page, or right-click a page and choose to clip it. You can also import a backup.' }),
      h('button', { class: 'btn primary', type: 'button', text: 'Import a backup', onclick: () => $('#import-file').click() }));
  } else if (filter.query) {
    box.append(h('h2', { text: 'No results' }), h('p', { text: `Nothing matches “${filter.query}” with the current filters.` }),
      h('button', { class: 'btn primary', type: 'button', text: 'Clear search and filters', onclick: clear }));
  } else {
    box.append(h('h2', { text: filter.folderId ? 'This folder is empty' : 'Nothing here' }),
      h('p', { text: filter.folderId ? 'Open a clip and choose this folder to file it here.' : 'No clips match these filters.' }),
      h('button', { class: 'btn primary', type: 'button', text: 'Show all clips', onclick: clear }));
  }
}

function card(clip) {
  const site = String(clip.siteName || hostOf(clip.url) || 'Unknown site');
  const tags = Array.isArray(clip.tags) ? clip.tags.map(String) : [];
  const hlCount = Array.isArray(clip.highlights) ? clip.highlights.length : 0;
  return h('div', {
    class: 'card', role: 'option', 'data-id': clip.id,
    tabindex: clip.id === focusedId ? '0' : '-1',
    'aria-selected': clip.id === openId ? 'true' : 'false',
    onclick: (e) => openReader(clip.id, e.currentTarget),
  },
  h('div', { class: 'card-site' }, h('span', { class: 'avatar', 'aria-hidden': 'true', text: site.charAt(0) }), h('span', { text: site })),
  h('div', { class: 'card-title', text: clip.title || '(untitled)' }),
  clip.excerpt ? h('p', { class: 'card-excerpt', text: clip.excerpt }) : null,
  tags.length ? h('div', { class: 'card-tags' }, tags.map((t) => h('span', { class: 'chip', text: t }))) : null,
  h('div', { class: 'card-foot' },
    h('span', { text: fmtShort(clip.createdAt) }),
    clip.note ? h('span', { class: 'ind', title: 'Has a note' }, icon('note'), h('span', { class: 'sr-only', text: 'Has a note' })) : null,
    hlCount ? h('span', { class: 'ind', title: `${hlCount} highlights` }, icon('mark'), h('span', { text: String(hlCount) })) : null));
}

/* ------------------------------------------------------ grid keyboard nav */

function cards() { return [...grid.querySelectorAll('.card')]; }

function focusCard(id) {
  focusedId = id;
  for (const c of cards()) c.tabIndex = c.dataset.id === id ? 0 : -1;
  grid.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.focus();
}

function neighbour(current, dir) {
  const list = cards();
  const i = list.indexOf(current);
  if (dir === 'next') return list[i + 1];
  if (dir === 'prev') return list[i - 1];
  const r = current.getBoundingClientRect();
  const down = dir === 'down';
  let best = null; let bestScore = Infinity;
  for (const c of list) {
    const b = c.getBoundingClientRect();
    const dy = down ? b.top - r.top : r.top - b.top;
    if (dy <= 4) continue;
    const score = dy * 10000 + Math.abs(b.left - r.left);
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best;
}

grid.addEventListener('keydown', (e) => {
  const cur = e.target.closest?.('.card');
  if (!cur) return;
  const list = cards();
  const list1 = viewMode === 'list';
  let target;
  switch (e.key) {
    case 'ArrowRight': target = neighbour(cur, 'next'); break;
    case 'ArrowLeft': target = neighbour(cur, 'prev'); break;
    case 'ArrowDown': target = list1 ? neighbour(cur, 'next') : neighbour(cur, 'down'); break;
    case 'ArrowUp': target = list1 ? neighbour(cur, 'prev') : neighbour(cur, 'up'); break;
    case 'Home': target = list[0]; break;
    case 'End': target = list[list.length - 1]; break;
    case 'Enter': case ' ': e.preventDefault(); openReader(cur.dataset.id, cur); return;
    case 'Delete': case 'Backspace': {
      e.preventDefault();
      const next = neighbour(cur, 'next') || neighbour(cur, 'prev');
      const clip = getClipById(cur.dataset.id);
      if (clip) { removeClip(clip).then(() => focusAfterRemove(next?.dataset.id)); }
      return;
    }
    default: return;
  }
  e.preventDefault();
  if (target) focusCard(target.dataset.id);
});

/* ------------------------------------------------------------- delete+undo */

function focusAfterRemove(nextId) {
  if (nextId && getClipById(nextId) && grid.querySelector(`.card[data-id="${CSS.escape(nextId)}"]`)) focusCard(nextId);
  else if (cards()[0]) focusCard(cards()[0].dataset.id);
  else $('#search').focus();
}

async function removeClip(clip) {
  const wasOpen = openId === clip.id;
  let nextId = null;
  if (wasOpen) {
    if (noteDirty) clip = { ...clip, note: $('#note').value };
    noteDirty = false; clearTimeout(noteTimer);
    const list = cards();
    const i = list.findIndex((c) => c.dataset.id === clip.id);
    nextId = (list[i + 1] || list[i - 1])?.dataset.id || null;
  }
  await deleteClip(clip.id);
  clips = clips.filter((c) => c.id !== clip.id);
  if (wasOpen) closeReader(false);
  render();
  if (wasOpen) focusAfterRemove(nextId);
  toast(`Deleted “${clip.title || 'clip'}”`, {
    actionLabel: 'Undo',
    onAction: async () => { await putClip(clip); clips.push(clip); focusedId = clip.id; render(); focusCard(clip.id); },
  });
}

/* ------------------------------------------------------------------ reader */

function openReader(id, originEl) {
  const clip = getClipById(id);
  if (!clip) return;
  if (openId && openId !== id) flushNote();
  openId = id;
  originId = originEl?.dataset?.id || id;
  focusedId = id;
  $('#reader-title').textContent = clip.title || '(untitled)';
  const src = $('#reader-source');
  src.textContent = clip.url || '';
  const href = safeHref(clip.url);
  if (href) src.setAttribute('href', href); else src.removeAttribute('href');
  renderReaderFolder();
  renderTagEditor();
  const note = $('#note');
  note.value = clip.note || '';
  $('#note-status').textContent = '';
  noteDirty = false;
  pendingScroll = 0;
  renderFrame();
  renderHighlightList();
  reader.inert = false;
  reader.classList.add('open');
  $('#scrim').hidden = false;
  grid.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-selected', c.dataset.id === id ? 'true' : 'false'));
  $('#reader-close').focus();
}

function closeReader(refocus = true) {
  if (!openId) return;
  flushNote();
  const back = originId;
  openId = null;
  hideHl();
  reader.classList.remove('open');
  reader.inert = true;
  $('#scrim').hidden = true;
  viewer.srcdoc = '';
  grid.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-selected', 'false'));
  if (refocus && back && grid.querySelector(`.card[data-id="${CSS.escape(back)}"]`)) focusCard(back);
}

function renderFrame() {
  const clip = getClipById(openId);
  if (!clip) return;
  const { srcdoc, found } = buildSrcdoc(clip);
  foundHighlights = found;
  viewer.srcdoc = srcdoc;
}

function renderReaderFolder() {
  const clip = getClipById(openId);
  if (!clip) return;
  const sel = $('#reader-folder');
  sel.replaceChildren(h('option', { value: '', text: 'Unfiled' }),
    ...[...folders].sort((a, b) => a.name.localeCompare(b.name)).map((f) => h('option', { value: f.id, text: f.name })));
  sel.value = clip.folderId && folders.some((f) => f.id === clip.folderId) ? clip.folderId : '';
}

$('#reader-folder').addEventListener('change', async (e) => {
  if (!openId) return;
  await patchClip(openId, { folderId: e.target.value || null });
  render();
});

function renderTagEditor() {
  const clip = getClipById(openId);
  const list = $('#tag-list');
  list.replaceChildren();
  for (const t of clip?.tags || []) {
    list.append(h('li', { class: 'chip-x' }, h('span', { text: t }),
      h('button', { type: 'button', 'aria-label': `Remove tag ${t}`, onclick: () => saveTags((clip.tags || []).filter((x) => x !== t)) }, icon('close'))));
  }
}

async function saveTags(tags) {
  if (!openId) return;
  await patchClip(openId, { tags });
  renderTagEditor();
  render();
  $('#tag-input').focus();
}

$('#tag-input').addEventListener('keydown', (e) => {
  const input = e.target;
  const clip = getClipById(openId);
  if (!clip) return;
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const tag = normalizeTag(input.value);
    input.value = '';
    if (tag && !(clip.tags || []).includes(tag)) saveTags([...(clip.tags || []), tag]);
  } else if (e.key === 'Backspace' && !input.value && clip.tags?.length) {
    saveTags(clip.tags.slice(0, -1));
  }
});

// Notes autosave (debounced) and flush on close/switch/blur.
let noteTimer;
let noteDirty = false;
$('#note').addEventListener('input', () => {
  noteDirty = true;
  $('#note-status').textContent = 'Unsaved changes';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(flushNote, 600);
});
$('#note').addEventListener('blur', flushNote);
async function flushNote() {
  clearTimeout(noteTimer);
  if (!noteDirty || !openId) return;
  noteDirty = false;
  const id = openId;
  await patchClip(id, { note: $('#note').value });
  if (openId === id) $('#note-status').textContent = 'Saved';
  render();
}

function renderHighlightList() {
  const clip = getClipById(openId);
  const list = $('#hl-list');
  list.replaceChildren();
  const hls = clip?.highlights || [];
  $('#hl-hint').hidden = hls.length > 0;
  for (const hl of hls) {
    list.append(h('li', { class: 'hl-item' },
      h('button', { class: 'hl-quote', type: 'button', title: 'Jump to highlight', onclick: () => jumpTo(hl.id) }, h('mark', { text: hl.text })),
      foundHighlights.has(hl.id) ? null : h('span', { class: 'hl-missing', text: 'not found in text' }),
      h('button', { class: 'btn icon-btn', type: 'button', 'aria-label': `Remove highlight: ${String(hl.text).slice(0, 40)}`, onclick: () => removeHighlight(hl.id) }, icon('trash'))));
  }
}

function jumpTo(id) {
  const doc = viewer.contentDocument;
  if (!doc) return;
  for (const m of doc.querySelectorAll('mark[data-hl-id]')) {
    if (m.getAttribute('data-hl-id') === String(id)) { m.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
  }
}

async function removeHighlight(id) {
  const clip = getClipById(openId);
  if (!clip) return;
  rememberScroll();
  await patchClip(openId, { highlights: (clip.highlights || []).filter((x) => x.id !== id) });
  renderFrame();
  renderHighlightList();
  render();
}

function rememberScroll() {
  try { pendingScroll = viewer.contentWindow.scrollY || 0; } catch { pendingScroll = 0; }
}

/* ---- selection -> floating Highlight button */

const hlBtn = $('#hl-btn');
function hideHl() { hlBtn.hidden = true; pendingHl = null; }

function onFrameSelection() {
  const doc = viewer.contentDocument;
  const sel = doc?.getSelection();
  if (!openId || !sel || sel.isCollapsed || !sel.rangeCount) { hideHl(); return; }
  const text = collapseWs(sel.toString());
  if (text.length < 2) { hideHl(); return; }
  const rr = sel.getRangeAt(0).getBoundingClientRect();
  const fr = viewer.getBoundingClientRect();
  const top = fr.top + rr.top;
  const bottom = fr.top + rr.bottom;
  if (bottom < fr.top || top > fr.bottom) { hlBtn.hidden = true; return; } // selection scrolled out of view
  pendingHl = text.slice(0, 1000);
  hlBtn.hidden = false;
  const w = hlBtn.offsetWidth || 90;
  const x = Math.min(Math.max(8, fr.left + rr.left + rr.width / 2 - w / 2), window.innerWidth - w - 8);
  let y = top - 44;
  if (y < fr.top + 4) y = Math.min(bottom + 8, fr.bottom - 44);
  hlBtn.style.left = `${x}px`;
  hlBtn.style.top = `${Math.max(8, y)}px`;
}

viewer.addEventListener('load', () => {
  if (!openId) return;
  try {
    const win = viewer.contentWindow;
    win.document.addEventListener('selectionchange', () => requestAnimationFrame(onFrameSelection));
    win.addEventListener('scroll', () => requestAnimationFrame(onFrameSelection), { passive: true });
    if (pendingScroll) win.scrollTo(0, pendingScroll);
  } catch { /* cross-origin should be impossible with allow-same-origin; ignore */ }
  pendingScroll = 0;
});

hlBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection alive
hlBtn.addEventListener('click', async () => {
  const text = pendingHl;
  const clip = getClipById(openId);
  hideHl();
  if (!text || !clip) return;
  const existing = clip.highlights || [];
  if (existing.some((x) => collapseWs(x.text) === text)) { toast('Already highlighted'); return; }
  rememberScroll();
  try { viewer.contentDocument.getSelection().removeAllRanges(); } catch { /* ignore */ }
  await patchClip(openId, { highlights: [...existing, { id: uid(), text, color: 'yellow', createdAt: Date.now() }] });
  renderFrame();
  renderHighlightList();
  render();
});
// The frame reloads after renderFrame(), so the list's "not found" flags refresh here too.
viewer.addEventListener('load', () => { if (openId) renderHighlightList(); });

/* ------------------------------------------------------ reader header btns */

$('#reader-close').addEventListener('click', () => closeReader());
$('#scrim').addEventListener('click', () => closeReader());
$('#export-md').addEventListener('click', () => {
  const clip = getClipById(openId);
  if (clip) download(`${slug(clip.title)}.md`, clipToMarkdown(clip), 'text/markdown');
});
$('#export-html').addEventListener('click', () => {
  const clip = getClipById(openId);
  if (clip) download(`${slug(clip.title)}.html`, standaloneHtml(clip), 'text/html');
});
$('#delete').addEventListener('click', () => {
  const clip = getClipById(openId);
  if (clip) removeClip(clip);
});

/* --------------------------------------------------------- top bar controls */

$('#search').addEventListener('input', (e) => { filter.query = e.target.value.trim(); renderGrid(); });
$('#clear-filters').addEventListener('click', () => {
  filter.query = ''; filter.folderId = undefined; filter.tags.clear(); $('#search').value = ''; render();
});

function applyView() {
  $('#view-grid').setAttribute('aria-pressed', String(viewMode === 'grid'));
  $('#view-list').setAttribute('aria-pressed', String(viewMode === 'list'));
}
$('#view-grid').addEventListener('click', () => { viewMode = 'grid'; store.set('view', viewMode); applyView(); renderGrid(); });
$('#view-list').addEventListener('click', () => { viewMode = 'list'; store.set('view', viewMode); applyView(); renderGrid(); });

$('#sort').addEventListener('change', (e) => { sortKey = e.target.value; store.set('sort', sortKey); renderGrid(); });

const THEMES = ['auto', 'light', 'dark'];
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  const btn = $('#theme-btn');
  setIcon(btn, theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'auto');
  btn.setAttribute('aria-label', `Theme: ${theme}`);
  btn.title = `Theme: ${theme} (click to change)`;
}
$('#theme-btn').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  store.set('theme', theme);
  applyTheme();
  toast(`Theme: ${theme}`, { timeout: 1800 });
});

$('#rail-toggle').addEventListener('click', () => {
  const open = document.body.classList.toggle('rail-open');
  $('#rail-toggle').setAttribute('aria-expanded', String(open));
});

$('#folder-add').addEventListener('click', () => {
  addingFolder = true; renamingFolderId = null; renderRail();
  $('#rail-folder-list input')?.focus();
});

/* ------------------------------------------------------------ import/export */

$('#export-btn').addEventListener('click', () => {
  if (!clips.length && !folders.length) { toast('Nothing to export yet'); return; }
  const b = buildBackup(clips, folders);
  const text = typeof b === 'string' ? b : JSON.stringify(b, null, 2);
  download(`clipfolio-backup-${new Date().toISOString().slice(0, 10)}.json`, text, 'application/json');
  toast(`Exported ${clips.length} ${clips.length === 1 ? 'clip' : 'clips'}`, { timeout: 3000 });
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());

const importDialog = $('#import-dialog');
let importPlan = null;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_IMPORT_CLIPS = 20000;

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { toast('That file is too large to import (limit 100 MB).'); return; }
  let parsed;
  try { parsed = parseBackup(await file.text()); } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.clips)) { toast('That file is not a Clipfolio backup.'); return; }
  if (parsed.clips.length > MAX_IMPORT_CLIPS) { toast(`That backup has too many clips (limit ${MAX_IMPORT_CLIPS}).`); return; }
  const merged = mergeImport(clips, parsed.clips);
  const knownFolders = new Set(folders.map((f) => f.id));
  const newFolders = [];
  for (const f of parsed.folders || []) {
    if (!f || !f.id || !f.name || knownFolders.has(f.id)) continue;
    knownFolders.add(f.id); // also dedupes repeated ids inside the file
    newFolders.push(f);
  }
  importPlan = { toAdd: merged.toAdd, newFolders, fileFolders: parsed.folders || [] };
  const dl = h('dl', {},
    ...[
      ['New clips to add', merged.toAdd.length],
      ['Already in library (skipped)', merged.skippedDuplicates.length ?? merged.skippedDuplicates],
      ['Invalid (skipped)', merged.invalid.length ?? merged.invalid],
      ['New folders', newFolders.length],
    ].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: String(v) })]));
  $('#import-body').replaceChildren(dl, h('p', { class: 'hint', text: 'Existing clips are never overwritten.' }));
  $('#import-confirm').disabled = merged.toAdd.length === 0 && newFolders.length === 0;
  importDialog.showModal();
});

importDialog.addEventListener('close', async () => {
  const plan = importPlan;
  importPlan = null;
  if (!plan || importDialog.returnValue !== 'ok') return;
  const known = new Set([...folders.map((f) => f.id), ...plan.newFolders.map((f) => f.id)]);
  const toAdd = plan.toAdd.map((c) => (c.folderId && !known.has(c.folderId) ? { ...c, folderId: null } : c));
  try {
    for (const f of plan.newFolders) { const nf = { id: f.id, name: f.name, createdAt: f.createdAt || Date.now() }; await putFolder(nf); folders.push(nf); }
    if (toAdd.length) await putClips(toAdd);
    clips = await listClips();
    render();
    toast(`Imported ${toAdd.length} ${toAdd.length === 1 ? 'clip' : 'clips'}`);
  } catch (err) {
    toast(`Import failed: ${err?.message || 'unknown error'}`);
  }
});

/* --------------------------------------------------------------- shortcuts */

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable);
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    $('#search').focus();
  } else if (e.key === 'Escape' && !importDialog.open) {
    if (openId) { e.preventDefault(); closeReader(); }
    else if (document.body.classList.contains('rail-open')) { document.body.classList.remove('rail-open'); $('#rail-toggle').setAttribute('aria-expanded', 'false'); }
  }
});
window.addEventListener('beforeunload', () => { if (noteDirty) flushNote(); });
window.addEventListener('pagehide', () => { if (noteDirty) flushNote(); });

/* -------------------------------------------------------------------- init */

(async () => {
  const topbar = document.querySelector('.topbar');
  const syncTopbar = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  syncTopbar();
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncTopbar).observe(topbar);
  setIcon($('#rail-toggle'), 'menu');
  setIcon($('#view-grid'), 'grid');
  setIcon($('#view-list'), 'list');
  setIcon($('#folder-add'), 'plus');
  setIcon($('#reader-close'), 'close');
  $('#import-btn').prepend(icon('upload'));
  $('#export-btn').prepend(icon('download'));
  $('#import-btn').setAttribute('aria-label', 'Import backup');
  $('#export-btn').setAttribute('aria-label', 'Export backup');
  if (!['newest', 'oldest', 'title', 'site'].includes(sortKey)) sortKey = 'newest';
  if (viewMode !== 'list') viewMode = 'grid';
  if (!THEMES.includes(theme)) theme = 'auto';
  $('#sort').value = sortKey;
  applyView();
  applyTheme();
  [clips, folders] = await Promise.all([listClips(), listFolders()]);
  render();
})();
