import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const extractSource = read('../src/extract.js');
const fixture = read('./fixtures/article.html');

// jsdom has no layout engine, so pretend every element is rendered.
function load(html = fixture) {
  const dom = new JSDOM(html, { url: 'https://example.com/news/bees', runScripts: 'outside-only' });
  dom.window.Element.prototype.getClientRects = function getClientRects() { return [{}]; };
  dom.window.eval(extractSource);
  return dom.window;
}

test('detects the main content container, not nav, sidebar or comments', () => {
  const win = load();
  const root = win.ClipperExtract.detectArticleRoot();
  assert.equal(root.id, 'story');
});

test('article clip keeps the story and drops share/sidebar/comment/footer noise', () => {
  const clip = load().ClipperExtract.extract({ mode: 'article' });
  assert.equal(clip.error, undefined);
  assert.equal(clip.title, 'How Bees Build Hives');
  assert.equal(clip.siteName, 'Nature Weekly');
  assert.equal(clip.byline, 'Ada Green');
  assert.match(clip.html, /hexagonal cells/);
  assert.doesNotMatch(clip.html, /Share this on social/);
  assert.doesNotMatch(clip.html, /Related one/);
  assert.doesNotMatch(clip.html, /First! This comment/);
  assert.doesNotMatch(clip.html, /Copyright Nature Weekly/);
  assert.ok(clip.wordCount > 30);
});

test('article clip removes scripts, event handlers and javascript: links', () => {
  const { html } = load().ClipperExtract.extract({ mode: 'article' });
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<script/i);
});

test('article clip makes URLs absolute and resolves lazy-loaded images', () => {
  const { html } = load().ClipperExtract.extract({ mode: 'article' });
  assert.match(html, /href="https:\/\/example\.com\/more\/bees"/);
  assert.match(html, /src="https:\/\/example\.com\/img\/hive\.jpg"/);
});

test('picked elements are clipped in document order with nested picks collapsed', () => {
  const win = load();
  const paragraphs = [...win.document.querySelectorAll('#story p')];
  const story = win.document.getElementById('story');
  const clip = win.ClipperExtract.extract({
    mode: 'multi',
    elements: [paragraphs[1], paragraphs[0], story, paragraphs[0]],
  });
  // `story` contains the paragraphs, so only it should be clipped (once).
  assert.equal(clip.html.match(/hexagonal cells/g).length, 1);
});

test('multi-select clips exactly the chosen blocks', () => {
  const win = load();
  const [first, , third] = win.document.querySelectorAll('#story p');
  const { html } = win.ClipperExtract.extract({ mode: 'multi', elements: [third, first] });
  assert.match(html, /hexagonal cells/);
  assert.match(html, /least wax/);
  assert.doesNotMatch(html, /storing honey/);
  assert.ok(html.indexOf('hexagonal cells') < html.indexOf('least wax'));
});

test('selection mode reports an error when nothing is selected', () => {
  const clip = load().ClipperExtract.extract({ mode: 'selection' });
  assert.match(clip.error, /nothing is selected/i);
});

test('selection mode clips only the highlighted content', () => {
  const win = load();
  const p = win.document.querySelectorAll('#story p')[1];
  const range = win.document.createRange();
  range.selectNodeContents(p);
  win.getSelection().addRange(range);
  const clip = win.ClipperExtract.extract({ mode: 'selection' });
  assert.match(clip.html, /storing honey/);
  assert.doesNotMatch(clip.html, /hexagonal cells/);
});

test('full page clip is a complete document with a base tag and no scripts', () => {
  const clip = load().ClipperExtract.extract({ mode: 'fullpage' });
  assert.match(clip.html, /^<!DOCTYPE html>/);
  assert.match(clip.html, /<base href="https:\/\/example\.com\/news\/bees"/);
  assert.doesNotMatch(clip.html, /window\.tracking/);
  assert.match(clip.html, /Copyright Nature Weekly/);
});

test('unknown mode returns an error instead of throwing', () => {
  assert.match(load().ClipperExtract.extract({ mode: 'nope' }).error, /unknown clip mode/i);
});
