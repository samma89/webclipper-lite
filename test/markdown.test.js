import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let htmlToMarkdown;
let clipToMarkdown;

before(async () => {
  const { window } = new JSDOM('');
  globalThis.DOMParser = window.DOMParser;
  globalThis.Node = window.Node;
  ({ htmlToMarkdown, clipToMarkdown } = await import('../src/markdown.js'));
});

test('headings, paragraphs and inline formatting', () => {
  const md = htmlToMarkdown('<h2>Title</h2><p>Some <strong>bold</strong>, <em>italic</em> and <code>code</code>.</p>');
  assert.equal(md, '## Title\n\nSome **bold**, *italic* and `code`.\n');
});

test('links and images', () => {
  const md = htmlToMarkdown('<p><a href="https://a.test/x">link</a> <img src="https://a.test/i.png" alt="pic"></p>');
  assert.match(md, /\[link\]\(https:\/\/a\.test\/x\)/);
  assert.match(md, /!\[pic\]\(https:\/\/a\.test\/i\.png\)/);
});

test('ordered, unordered and nested lists', () => {
  const md = htmlToMarkdown('<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>a</li><li>b</li></ol>');
  assert.match(md, /^- one$/m);
  assert.match(md, /^- two\n {2}- nested$/m);
  assert.match(md, /^1\. a$/m);
  assert.match(md, /^2\. b$/m);
});

test('code blocks keep their content verbatim', () => {
  const md = htmlToMarkdown('<pre><code>if (a) {\n  b();\n}</code></pre>');
  assert.match(md, /```\nif \(a\) \{\n {2}b\(\);\n\}\n```/);
});

test('blockquotes and horizontal rules', () => {
  const md = htmlToMarkdown('<blockquote><p>quoted</p></blockquote><hr>');
  assert.match(md, /^> quoted$/m);
  assert.match(md, /^---$/m);
});

test('tables become pipe tables and escape pipes in cells', () => {
  const md = htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1|2</td><td>3</td></tr></table>');
  assert.match(md, /\| A \| B \|\n\| --- \| --- \|\n\| 1\\\|2 \| 3 \|/);
});

test('scripts and styles are dropped', () => {
  const md = htmlToMarkdown('<p>keep</p><script>evil()</script><style>p{}</style>');
  assert.equal(md, 'keep\n');
});

test('clipToMarkdown adds front matter with escaped quotes', () => {
  const md = clipToMarkdown({
    title: 'He said "hi"',
    url: 'https://a.test/',
    byline: 'Ada',
    createdAt: Date.UTC(2026, 0, 2),
    mode: 'article',
    html: '<p>Body</p>',
  });
  assert.match(md, /^---\ntitle: "He said \\"hi\\""\nsource: "https:\/\/a\.test\/"\nauthor: "Ada"\nclipped: 2026-01-02T00:00:00\.000Z\nmode: article\n---\n/);
  assert.match(md, /# He said "hi"\n\nBody\n$/);
});
