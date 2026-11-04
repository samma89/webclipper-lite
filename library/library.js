import { listClips, deleteClip } from '../src/db.js';
import { clipToMarkdown } from '../src/markdown.js';

const $ = (sel) => document.querySelector(sel);
const listEl = $('#list');
const viewer = $('#viewer');

let clips = [];
let selectedId = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const slug = (s) => (s || 'clip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'clip';

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Article and selection clips are fragments, so wrap them in a readable page.
// Full-page clips are already complete documents.
function standaloneHtml(clip) {
  if (clip.mode === 'fullpage') return clip.html;
  const byline = [clip.byline, clip.siteName, fmtDate(clip.createdAt)].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${esc(clip.url)}" target="_blank">
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

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const shown = clips.filter((c) => !q || `${c.title} ${c.url} ${c.excerpt || ''}`.toLowerCase().includes(q));
  listEl.textContent = '';
  $('#empty').hidden = clips.length > 0;
  for (const clip of shown) {
    const li = document.createElement('li');
    li.dataset.id = clip.id;
    li.className = clip.id === selectedId ? 'active' : '';
    li.innerHTML = `<div class="item-title">${esc(clip.title)}</div>
      <div class="item-meta">${esc(clip.siteName || '')} · ${esc(clip.mode)} · ${esc(fmtDate(clip.createdAt))}</div>`;
    li.addEventListener('click', () => select(clip.id));
    listEl.appendChild(li);
  }
}

function select(id) {
  selectedId = id;
  const clip = clips.find((c) => c.id === id);
  $('#toolbar').hidden = !clip;
  if (!clip) {
    viewer.srcdoc = '';
    renderList();
    return;
  }
  $('#clip-title').textContent = clip.title;
  const source = $('#clip-source');
  source.textContent = clip.url;
  source.href = clip.url;
  viewer.srcdoc = standaloneHtml(clip);
  renderList();
}

$('#search').addEventListener('input', renderList);

$('#export-md').addEventListener('click', () => {
  const clip = clips.find((c) => c.id === selectedId);
  if (clip) download(`${slug(clip.title)}.md`, clipToMarkdown(clip), 'text/markdown');
});

$('#export-html').addEventListener('click', () => {
  const clip = clips.find((c) => c.id === selectedId);
  if (clip) download(`${slug(clip.title)}.html`, standaloneHtml(clip), 'text/html');
});

$('#export-all').addEventListener('click', () => {
  if (!clips.length) return;
  download(`clipfolio-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(clips, null, 2), 'application/json');
});

$('#delete').addEventListener('click', async () => {
  const clip = clips.find((c) => c.id === selectedId);
  if (!clip || !confirm(`Delete “${clip.title}”?`)) return;
  await deleteClip(clip.id);
  clips = clips.filter((c) => c.id !== clip.id);
  select(clips.length ? clips[0].id : null);
});

(async () => {
  clips = await listClips();
  select(clips.length ? clips[0].id : null);
})();
