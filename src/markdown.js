// Small HTML -> Markdown converter. Needs DOMParser, so it runs in pages, not the service worker.
export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const walk = (node) => [...node.childNodes].map(convert).join('');

function cell(el) {
  return walk(el).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

function convert(n) {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent.replace(/\s+/g, ' ');
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = n.tagName.toLowerCase();
  const inner = () => walk(n);

  switch (tag) {
    case 'script': case 'style': case 'noscript': case 'template':
      return '';
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return `\n\n${'#'.repeat(Number(tag[1]))} ${inner().replace(/\s+/g, ' ').trim()}\n\n`;
    case 'p':
      return `\n\n${inner().trim()}\n\n`;
    case 'div': case 'section': case 'article': case 'main': case 'header': case 'figure': case 'figcaption':
      return `\n${inner()}\n`;
    case 'br':
      return '  \n';
    case 'hr':
      return '\n\n---\n\n';
    case 'strong': case 'b': {
      const t = inner().trim();
      return t ? `**${t}**` : '';
    }
    case 'em': case 'i': {
      const t = inner().trim();
      return t ? `*${t}*` : '';
    }
    case 'del': case 's': {
      const t = inner().trim();
      return t ? `~~${t}~~` : '';
    }
    case 'code':
      return n.parentElement && n.parentElement.tagName === 'PRE' ? n.textContent : `\`${n.textContent}\``;
    case 'pre':
      return `\n\n\`\`\`\n${n.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
    case 'a': {
      const href = n.getAttribute('href');
      const t = inner().trim();
      if (!t) return '';
      return href ? `[${t}](${href})` : t;
    }
    case 'img': {
      const src = n.getAttribute('src');
      return src ? `![${n.getAttribute('alt') || ''}](${src})` : '';
    }
    case 'blockquote':
      return '\n\n' + inner().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    case 'ul': case 'ol': {
      const items = [...n.children].filter((c) => c.tagName === 'LI').map((li, i) => {
        const marker = tag === 'ol' ? `${i + 1}. ` : '- ';
        return marker + walk(li).trim().replace(/\n+/g, '\n').replace(/\n/g, '\n  ');
      });
      return `\n\n${items.join('\n')}\n\n`;
    }
    case 'table': {
      const rows = [...n.querySelectorAll('tr')].map((tr) => [...tr.children].map(cell));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r) => [...r, ...Array(width - r.length).fill('')];
      const line = (r) => `| ${pad(r).join(' | ')} |`;
      const [head, ...rest] = rows;
      return `\n\n${[line(head), line(Array(width).fill('---')), ...rest.map(line)].join('\n')}\n\n`;
    }
    default:
      return inner();
  }
}

const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function clipToMarkdown(clip) {
  const front = [
    '---',
    `title: ${q(clip.title)}`,
    `source: ${q(clip.url)}`,
    clip.byline ? `author: ${q(clip.byline)}` : null,
    clip.published ? `published: ${q(clip.published)}` : null,
    `clipped: ${new Date(clip.createdAt).toISOString()}`,
    `mode: ${clip.mode}`,
    '---',
    '',
  ].filter((l) => l !== null).join('\n');
  return `${front}\n# ${clip.title}\n\n${htmlToMarkdown(clip.html)}`;
}
