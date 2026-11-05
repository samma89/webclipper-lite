import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTag, allTags, filterClips, sortClips, mergeImport, parseBackup, buildBackup,
} from '../src/library-model.js';

const clip = (o) => ({ id: 'x', title: 'T', url: 'https://a.com/', html: '<p>', createdAt: 1, ...o });
const A = clip({ id: 'a', title: 'Banana bread', url: 'https://food.com/b', createdAt: 3, tags: ['food', 'baking'], folderId: 'f1', excerpt: 'sweet loaf' });
const B = clip({ id: 'b', title: 'apple pie', url: 'https://www.zeta.com/p', createdAt: 2, tags: ['food'], note: 'Grandma recipe', siteName: 'Zeta' });
const C = clip({ id: 'c', title: 'Cats', url: 'https://cats.org/', createdAt: 1 });

test('normalizeTag trims, lowercases, collapses, caps at 40', () => {
  assert.equal(normalizeTag('  Foo   BAR '), 'foo bar');
  assert.equal(normalizeTag('x'.repeat(50)).length, 40);
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag(null), '');
});

test('allTags counts, sorts by count desc then alpha, dedupes per clip', () => {
  const r = allTags([A, B, clip({ id: 'd', tags: ['Food', 'food', 'zen'] })]);
  assert.deepEqual(r, [{ tag: 'food', count: 3 }, { tag: 'baking', count: 1 }, { tag: 'zen', count: 1 }]);
});

test('filterClips: folder semantics', () => {
  const all = [A, B, C];
  assert.equal(filterClips(all, {}).length, 3);
  assert.deepEqual(filterClips(all, { folderId: undefined }).length, 3);
  assert.deepEqual(filterClips(all, { folderId: null }).map((c) => c.id), ['b', 'c']);
  assert.deepEqual(filterClips(all, { folderId: 'f1' }).map((c) => c.id), ['a']);
});

test('filterClips: tags use AND logic', () => {
  const all = [A, B, C];
  assert.deepEqual(filterClips(all, { tags: ['food'] }).map((c) => c.id), ['a', 'b']);
  assert.deepEqual(filterClips(all, { tags: ['Food', 'baking'] }).map((c) => c.id), ['a']);
  assert.deepEqual(filterClips(all, { tags: ['food', 'nope'] }), []);
});

test('filterClips: query matches title/url/excerpt/tags/note, all terms required', () => {
  const all = [A, B, C];
  assert.deepEqual(filterClips(all, { query: 'BANANA' }).map((c) => c.id), ['a']);
  assert.deepEqual(filterClips(all, { query: 'zeta.com' }).map((c) => c.id), ['b']);
  assert.deepEqual(filterClips(all, { query: 'loaf' }).map((c) => c.id), ['a']);
  assert.deepEqual(filterClips(all, { query: 'baking' }).map((c) => c.id), ['a']);
  assert.deepEqual(filterClips(all, { query: 'grandma' }).map((c) => c.id), ['b']);
  assert.deepEqual(filterClips(all, { query: 'food grandma' }).map((c) => c.id), ['b']);
  assert.deepEqual(filterClips(all, { query: 'banana grandma' }), []);
});

test('filterClips: combined filters', () => {
  assert.deepEqual(filterClips([A, B, C], { query: 'pie', tags: ['food'], folderId: null }).map((c) => c.id), ['b']);
});

test('sortClips keys, without mutating input', () => {
  const all = [C, A, B];
  const ids = (k) => sortClips(all, k).map((c) => c.id);
  assert.deepEqual(ids('newest'), ['a', 'b', 'c']);
  assert.deepEqual(ids('oldest'), ['c', 'b', 'a']);
  assert.deepEqual(ids('title'), ['b', 'a', 'c']);
  assert.deepEqual(ids('site'), ['c', 'a', 'b']); // cats.org, food.com, Zeta
  assert.deepEqual(ids('bogus'), ['a', 'b', 'c']);
  assert.deepEqual(all.map((c) => c.id), ['c', 'a', 'b']);
});

test('mergeImport dedupes by id and by url+createdAt, never overwrites', () => {
  const existing = [A];
  const incoming = [
    { ...A, title: 'changed' },                       // same id
    clip({ id: 'new1', url: A.url, createdAt: A.createdAt }), // same url+createdAt
    clip({ id: 'ok', url: 'https://ok.com/', createdAt: 9 }),
    clip({ id: 'ok', url: 'https://other.com/', createdAt: 10 }), // dup within incoming
  ];
  const r = mergeImport(existing, incoming);
  assert.deepEqual(r.toAdd.map((c) => c.id), ['ok']);
  assert.equal(r.skippedDuplicates, 3);
  assert.equal(r.invalid, 0);
  assert.equal(existing[0].title, 'Banana bread');
});

test('mergeImport counts invalid clips', () => {
  const r = mergeImport([], [
    null, 'str', { id: 'a' }, clip({ html: undefined }), clip({ id: '' }),
    clip({ createdAt: '1' }), clip({ id: 'good' }),
  ]);
  assert.equal(r.invalid, 6);
  assert.deepEqual(r.toAdd.map((c) => c.id), ['good']);
});

test('parseBackup accepts old array format', () => {
  const r = parseBackup(JSON.stringify([A, B]));
  assert.equal(r.clips.length, 2);
  assert.deepEqual(r.folders, []);
});

test('parseBackup accepts new format and round-trips buildBackup', () => {
  const b = buildBackup([A], [{ id: 'f1', name: 'Food', createdAt: 1 }]);
  assert.equal(b.format, 'clipfolio-backup');
  assert.equal(b.version, 2);
  assert.equal(typeof b.exportedAt, 'number');
  const r = parseBackup(JSON.stringify(b));
  assert.deepEqual(r.clips, [A]);
  assert.deepEqual(r.folders, [{ id: 'f1', name: 'Food', createdAt: 1 }]);
});

test('parseBackup drops malformed folders and rejects garbage', () => {
  const r = parseBackup(JSON.stringify({ format: 'clipfolio-backup', version: 2, clips: [], folders: [{ id: 1 }, { id: 'f', name: 'N' }] }));
  assert.deepEqual(r.folders.map((f) => f.id), ['f']);
  assert.throws(() => parseBackup('not json'));
  assert.throws(() => parseBackup('{"foo":1}'));
  assert.throws(() => parseBackup('42'));
});

test('mergeImport sanitizes hostile field types', () => {
  const r = mergeImport([], [clip({ id: 'h', siteName: 123, tags: 5, highlights: { a: 1 }, folderId: 7, note: {} })]);
  const c = r.toAdd[0];
  assert.equal(c.siteName, undefined);
  assert.equal(c.tags, undefined);
  assert.equal(c.highlights, undefined);
  assert.equal(c.folderId, null);
  const r2 = mergeImport([], [clip({ id: 'h2', tags: [' A ', 'a', 3], highlights: [{ text: 5 }, { text: 'hi' }] })]);
  assert.deepEqual(r2.toAdd[0].tags, ['a']);
  assert.equal(r2.toAdd[0].highlights.length, 1);
  assert.equal(r2.toAdd[0].highlights[0].color, 'yellow');
});
