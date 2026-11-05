// Pure library logic (no DOM, no IndexedDB). Unit-tested with node:test.

const MAX_TAG = 40;
export const BACKUP_FORMAT = 'clipfolio-backup';
export const BACKUP_VERSION = 2;

export function normalizeTag(s) {
  if (typeof s !== 'string') return '';
  return s.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG).trim();
}

const tagsOf = (clip) =>
  Array.isArray(clip && clip.tags) ? clip.tags.map(normalizeTag).filter(Boolean) : [];

export function allTags(clips) {
  const counts = new Map();
  for (const clip of clips || []) {
    for (const t of new Set(tagsOf(clip))) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts].map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function filterClips(clips, { query, folderId, tags } = {}) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const wanted = (tags || []).map(normalizeTag).filter(Boolean);
  return (clips || []).filter((clip) => {
    if (folderId === null && clip.folderId != null) return false;
    if (typeof folderId === 'string' && clip.folderId !== folderId) return false;
    if (wanted.length) {
      const have = new Set(tagsOf(clip));
      if (!wanted.every((t) => have.has(t))) return false;
    }
    if (terms.length) {
      const hay = [clip.title, clip.url, clip.excerpt, clip.note, tagsOf(clip).join(' ')]
        .filter((x) => typeof x === 'string').join('\n').toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function siteOf(clip) {
  if (clip.siteName) return String(clip.siteName);
  try { return new URL(clip.url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function sortClips(clips, key = 'newest') {
  const byNew = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  const text = (f) => (a, b) =>
    f(a).localeCompare(f(b), undefined, { sensitivity: 'base' }) || byNew(a, b);
  const cmp = {
    newest: byNew,
    oldest: (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
    title: text((c) => String(c.title || '')),
    site: text(siteOf),
  }[key] || byNew;
  return [...(clips || [])].sort(cmp);
}

export function isValidClip(c) {
  return !!c && typeof c === 'object'
    && typeof c.id === 'string' && c.id !== ''
    && typeof c.title === 'string'
    && typeof c.url === 'string' && c.url !== ''
    && typeof c.html === 'string'
    && typeof c.createdAt === 'number' && Number.isFinite(c.createdAt);
}

const STR_KEYS = ['siteName', 'byline', 'excerpt', 'note', 'mode', 'published', 'description', 'image'];

// Builds a fresh object with known keys only and coerced types, so imported data
// can never break rendering (and a hostile own `__proto__` key is dropped).
export function sanitizeClip(c) {
  const out = { id: c.id, title: c.title, url: c.url, html: c.html, createdAt: c.createdAt };
  for (const k of STR_KEYS) if (typeof c[k] === 'string' && c[k]) out[k] = c[k];
  if (typeof c.updatedAt === 'number' && Number.isFinite(c.updatedAt)) out.updatedAt = c.updatedAt;
  if (typeof c.wordCount === 'number' && Number.isFinite(c.wordCount)) out.wordCount = c.wordCount;
  out.folderId = typeof c.folderId === 'string' && c.folderId ? c.folderId : null;
  if (Array.isArray(c.tags)) out.tags = [...new Set(c.tags.map(normalizeTag).filter(Boolean))];
  if (Array.isArray(c.highlights)) {
    out.highlights = c.highlights
      .filter((h) => h && typeof h === 'object' && typeof h.text === 'string' && h.text.trim())
      .map((h, i) => ({
        id: typeof h.id === 'string' && h.id ? h.id : `${c.id}-hl${i}`,
        text: h.text,
        color: 'yellow',
        createdAt: typeof h.createdAt === 'number' && Number.isFinite(h.createdAt) ? h.createdAt : c.createdAt,
      }));
  }
  return out;
}

// skippedDuplicates and invalid are counts. Never overwrites existing clips.
export function mergeImport(existing, incoming) {
  const ids = new Set();
  const keys = new Set();
  const key = (c) => `${c.url}\u0000${c.createdAt}`;
  for (const c of existing || []) { ids.add(c.id); keys.add(key(c)); }
  const toAdd = [];
  let skippedDuplicates = 0;
  let invalid = 0;
  for (const c of incoming || []) {
    if (!isValidClip(c)) { invalid++; continue; }
    if (ids.has(c.id) || keys.has(key(c))) { skippedDuplicates++; continue; }
    ids.add(c.id); keys.add(key(c));
    toAdd.push(sanitizeClip(c));
  }
  return { toAdd, skippedDuplicates, invalid };
}

// Accepts the v1 export (bare array of clips) or the v2 envelope. Throws on bad input.
export function parseBackup(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); } catch { throw new Error('Not a valid JSON file'); }
  if (Array.isArray(data)) return { clips: data, folders: [] };
  if (data && typeof data === 'object' && data.format === BACKUP_FORMAT && Array.isArray(data.clips)) {
    const folders = (Array.isArray(data.folders) ? data.folders : [])
      .filter((f) => f && typeof f.id === 'string' && f.id && typeof f.name === 'string');
    return { clips: data.clips, folders };
  }
  throw new Error('Unrecognized backup format');
}

export function buildBackup(clips, folders) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    clips: clips || [],
    folders: folders || [],
  };
}
