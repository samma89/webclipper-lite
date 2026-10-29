// Classic script, injected on demand with chrome.scripting.executeScript({ files }).
// Defines globalThis.ClipperExtract in the extension's isolated world, which the
// picker (src/picker.js) and the quick-clip path in src/clip.js both use.
(() => {
  if (globalThis.ClipperExtract) return;

  const JUNK = 'script,noscript,iframe,object,embed,template';
  const LIGHT_JUNK = 'button,input,select,textarea,[hidden]';
  const ARTICLE_JUNK = 'nav,aside,footer,form,button,input,select,textarea,svg,canvas,dialog,[hidden],[aria-hidden="true"]';
  const SKIP_ANCESTORS = 'nav,aside,footer,script,style,noscript,[role="navigation"],[role="complementary"],[role="banner"],[aria-hidden="true"]';
  const NEG = /(^|[\s_-])(comments?|sidebar|sponsor|advert(isement)?|ads?|promo|related|share|sharing|social|popup|modal|cookie|newsletter|subscribe|nav|menu|breadcrumbs?|pagination|footer)($|[\s_-])/i;
  const POS = /article|content|post|entry|story|body|main|text|blog/i;

  const abs = (url) => {
    try { return new URL(url, document.baseURI).href; } catch { return url; }
  };
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const classString = (el) => `${typeof el.className === 'string' ? el.className : ''} ${el.id || ''}`;

  function linkDensity(el) {
    const total = textOf(el).length;
    if (!total) return 0;
    let linked = 0;
    el.querySelectorAll('a').forEach((a) => { linked += textOf(a).length; });
    return linked / total;
  }

  function classWeight(el) {
    const s = classString(el);
    return (NEG.test(s) ? -25 : 0) + (POS.test(s) ? 25 : 0);
  }

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  // Finds the element holding the page's main content. Works on the live DOM and does not
  // rely on <p> tags, so it also copes with div/span-based editors (X articles, Notion, ...).
  function detectArticleRoot() {
    const body = document.body;
    const semantic = body.querySelector('article, [role="main"], main');
    const scores = new Map();
    const visibleCache = new Map();
    const visible = (el) => {
      let v = visibleCache.get(el);
      if (v === undefined) { v = isVisible(el); visibleCache.set(el, v); }
      return v;
    };

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (text.length < 25) continue;
      const el = node.parentElement;
      if (!el || el.closest(SKIP_ANCESTORS) || !visible(el)) continue;
      const s = 1 + (text.match(/[,，、]/g) || []).length + Math.min(Math.floor(text.length / 100), 3);
      let level = 0;
      for (let a = el.parentElement; a && a !== body && level < 5; a = a.parentElement, level++) {
        if (!scores.has(a)) scores.set(a, classWeight(a));
        scores.set(a, scores.get(a) + (level === 0 ? s : level === 1 ? s / 2 : s / (level * 3)));
      }
    }

    // Link density is costly, so only look at the strongest few candidates.
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    let best = null;
    let bestScore = 0;
    for (const [el, s] of top) {
      const adjusted = s * (1 - linkDensity(el));
      if (adjusted > bestScore) { best = el; bestScore = adjusted; }
    }
    if (!best || bestScore < 20) return semantic || body;

    // Drop through wrappers that hold nearly all of the text.
    for (;;) {
      const total = (best.textContent || '').trim().length;
      let child = null;
      let childLen = 0;
      for (const c of best.children) {
        const len = (c.textContent || '').trim().length;
        if (len > childLen) { child = c; childLen = len; }
      }
      if (child && childLen >= total * 0.8 && !/^(P|LI|TD|TR|PRE|BLOCKQUOTE|H[1-6])$/.test(child.tagName)) best = child;
      else break;
    }

    // Prefer a semantic container that wraps the winner without much extra.
    if (semantic && semantic.contains(best) && textOf(semantic).length < textOf(best).length * 1.5) return semantic;
    return best;
  }

  function absolutize(root) {
    for (const attr of ['href', 'src', 'poster']) {
      root.querySelectorAll(`[${attr}]`).forEach((el) => {
        const v = el.getAttribute(attr);
        if (v && !v.startsWith('#') && !/^(data|blob|javascript):/i.test(v)) el.setAttribute(attr, abs(v));
      });
    }
    root.querySelectorAll('[srcset]').forEach((el) => {
      const fixed = el.getAttribute('srcset').split(',').map((part) => {
        const [url, ...rest] = part.trim().split(/\s+/);
        return [abs(url), ...rest].join(' ');
      });
      el.setAttribute('srcset', fixed.join(', '));
    });
  }

  function fixLazyImages(root) {
    root.querySelectorAll('img').forEach((img) => {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
      const src = img.getAttribute('src') || '';
      if (lazy && (!src || src.startsWith('data:'))) img.setAttribute('src', lazy);
    });
  }

  function stripUnsafe(root) {
    root.querySelectorAll(JUNK).forEach((el) => el.remove());
    root.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || (/^(href|src|action|formaction)$/.test(name) && /^\s*javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      }
    });
  }

  // Cloned fragments lose the site's CSS, so copy over the handful of styles that carry
  // meaning (bold, italic, strike, big text). rem keeps nested sizes from compounding.
  function inlineTextStyles(live, clone) {
    const baseSize = parseFloat(getComputedStyle(live).fontSize) || 16;
    const lw = document.createTreeWalker(live, NodeFilter.SHOW_ELEMENT);
    const cw = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    do {
      const l = lw.currentNode;
      const c = cw.currentNode;
      const ownText = [...l.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim());
      if (ownText) {
        const cs = getComputedStyle(l);
        const css = [];
        if (parseInt(cs.fontWeight, 10) >= 600) css.push('font-weight:700');
        if (cs.fontStyle === 'italic') css.push('font-style:italic');
        if (cs.textDecorationLine.includes('line-through')) css.push('text-decoration:line-through');
        else if (cs.textDecorationLine.includes('underline') && l.tagName !== 'A') css.push('text-decoration:underline');
        const ratio = (parseFloat(cs.fontSize) || baseSize) / baseSize;
        if (ratio > 1.15 || ratio < 0.85) css.push(`font-size:${ratio.toFixed(2)}rem`);
        if (css.length) c.setAttribute('style', css.join(';'));
      }
      count++;
    } while (count < 4000 && lw.nextNode() && cw.nextNode());
  }

  function trimArticle(el, title) {
    el.querySelectorAll(ARTICLE_JUNK).forEach((n) => n.remove());
    el.querySelectorAll('div,section,ul,ol,p,span,header').forEach((n) => {
      if (!el.contains(n)) return; // already removed along with an ancestor (clones are detached, so isConnected won't work)
      const len = textOf(n).length;
      if ((NEG.test(classString(n)) && len < 500) || (len > 0 && len < 300 && linkDensity(n) > 0.6 && !n.querySelector('img'))) n.remove();
    });
    const h1 = el.querySelector('h1');
    if (h1 && title && textOf(h1).toLowerCase() === title.toLowerCase()) h1.remove();
  }

  const meta = (name) => {
    const m = document.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
    return (m && m.content && m.content.trim()) || '';
  };

  function pageMeta() {
    const info = {
      url: location.href,
      title: meta('og:title') || document.title || location.hostname,
      siteName: meta('og:site_name') || location.hostname,
      byline: meta('author') || meta('article:author'),
      published: meta('article:published_time') || meta('date'),
      description: meta('og:description') || meta('description'),
      image: meta('og:image') ? abs(meta('og:image')) : '',
    };
    if (!info.image) delete info.image;
    return info;
  }

  // Keeps document order and drops elements nested inside another selected element.
  function normalizeSelection(elements) {
    const live = elements.filter((el) => el && el.isConnected);
    const sorted = live.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return sorted.filter((el) => !sorted.some((other) => other !== el && other.contains(el)));
  }

  // options.mode: 'article' | 'multi' | 'fullpage' | 'selection'
  // options.elements: live elements to clip (article/multi). Omitted = auto-detect.
  // options.autoClean: also strip nav/ads/link lists (use for auto-detected content).
  function extract(options) {
    const mode = options.mode;
    const base = { mode, ...pageMeta() };
    const finish = (html, text) => ({
      ...base,
      html,
      excerpt: base.description || text.slice(0, 200),
      wordCount: text ? text.split(/\s+/).length : 0,
    });

    if (mode === 'selection') {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return { error: 'Nothing is selected on this page.' };
      const box = document.createElement('div');
      for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
      stripUnsafe(box);
      fixLazyImages(box);
      absolutize(box);
      return finish(box.innerHTML, textOf(box));
    }

    if (mode === 'article' || mode === 'multi') {
      const auto = !options.elements;
      const elements = normalizeSelection(options.elements || [detectArticleRoot()]);
      if (!elements.length) return { error: 'Nothing is selected.' };
      const wrapper = document.createElement('div');
      for (const el of elements) {
        const clone = el.cloneNode(true);
        inlineTextStyles(el, clone);
        stripUnsafe(clone);
        fixLazyImages(clone);
        if (auto || options.autoClean) trimArticle(clone, base.title);
        else clone.querySelectorAll(LIGHT_JUNK).forEach((n) => n.remove());
        absolutize(clone);
        wrapper.appendChild(clone);
      }
      return finish(wrapper.innerHTML, textOf(wrapper));
    }

    if (mode === 'fullpage') {
      const doc = document.documentElement.cloneNode(true);
      stripUnsafe(doc);
      fixLazyImages(doc);

      // Inline readable external stylesheets so the saved copy still looks right.
      let css = '';
      const inlined = new Set();
      for (const sheet of document.styleSheets) {
        if (!sheet.href) continue;
        try {
          const rules = [...sheet.cssRules].map((r) => r.cssText).join('\n');
          css += rules.replace(/url\((['"]?)(?!data:|https?:|\/\/|#)([^)'"]+)\1\)/g, (m, q, u) => {
            try { return `url("${new URL(u, sheet.href).href}")`; } catch { return m; }
          }) + '\n';
          inlined.add(sheet.href);
        } catch { /* cross-origin sheet: keep the <link> */ }
      }
      doc.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => { if (inlined.has(l.href)) l.remove(); });
      doc.querySelectorAll('link[rel="preload"],link[rel="prefetch"],link[rel="modulepreload"]').forEach((l) => l.remove());
      absolutize(doc);

      const head = doc.querySelector('head') || doc.insertBefore(document.createElement('head'), doc.firstChild);
      const baseEl = document.createElement('base');
      baseEl.href = document.baseURI;
      baseEl.target = '_blank';
      head.prepend(baseEl);
      if (css) {
        const style = document.createElement('style');
        style.textContent = css;
        head.appendChild(style);
      }
      return finish('<!DOCTYPE html>\n' + doc.outerHTML, textOf(document.body));
    }

    return { error: `Unknown clip mode: ${mode}` };
  }

  globalThis.ClipperExtract = { detectArticleRoot, extract, pageMeta };
})();
