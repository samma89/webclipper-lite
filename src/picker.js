// Classic script injected after src/extract.js. Shows the in-page content picker:
// auto-detected region outlined and the rest dimmed, +/- to grow or shrink it,
// multi-select to add or remove blocks, then save to the library.
(() => {
  const KEY = '__clipperLitePicker';
  if (globalThis[KEY]) { globalThis[KEY].destroy(); return; } // second click toggles it off
  const X = globalThis.ClipperExtract;
  if (!X) return;

  const MODES = [
    { id: 'article', label: 'Article', hint: 'The main content is outlined. Click any block to move the selection, or use + / − to grow or shrink it.' },
    { id: 'multi', label: 'Multi-select', hint: 'Click blocks to add them. Click a selected block to remove it, or click inside one to cut that part out.' },
    { id: 'fullpage', label: 'Full page', hint: 'Saves the whole page with its styles.' },
    { id: 'selection', label: 'Selection', hint: 'Highlight text on the page, then save.' },
  ];
  const POINTER_EVENTS = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick', 'auxclick'];

  const state = { mode: 'article', selected: [], history: [], hover: null, auto: null, busy: false };
  let dirty = true;
  let destroyed = false;

  // ---- DOM (inside a closed shadow root so page CSS can't touch it) ----
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) el.append(kid);
    return el;
  };

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
    .panel, .resize { pointer-events: auto; font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #1f2328; }
    .panel {
      position: fixed; top: 16px; right: 16px; width: 288px; padding: 14px;
      background: #fff; border: 1px solid #d0d7de; border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.28);
    }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-weight: 600; }
    .x { border: 0; background: none; font-size: 18px; line-height: 1; cursor: pointer; color: #656d76; padding: 2px 6px; }
    input.title {
      width: 100%; padding: 7px 9px; border: 1px solid #d0d7de; border-radius: 6px;
      font: inherit; color: inherit; background: #fff; margin-bottom: 10px;
    }
    .save {
      width: 100%; padding: 9px; border: 0; border-radius: 6px; background: #2e9e4f;
      color: #fff; font: inherit; font-weight: 600; cursor: pointer;
    }
    .save:disabled { background: #a9d9b8; cursor: not-allowed; }
    .label { margin: 14px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #656d76; }
    .mode {
      display: flex; width: 100%; align-items: center; justify-content: space-between;
      padding: 7px 9px; border: 0; border-radius: 6px; background: none;
      font: inherit; color: inherit; text-align: left; cursor: pointer;
    }
    .mode:hover { background: #f3f4f6; }
    .mode.on { background: #e8f5ec; font-weight: 600; }
    .hint { margin-top: 10px; color: #656d76; font-size: 12px; }
    .status { margin-top: 10px; min-height: 1.2em; font-size: 12px; }
    .status.err { color: #c62828; }
    .foot { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; }
    .foot button, .done button {
      border: 0; background: none; padding: 0; font: inherit; color: #1a6fd1; cursor: pointer;
    }
    .done { text-align: center; padding: 8px 0 2px; }
    .done .ok { font-size: 15px; font-weight: 600; color: #2e7d32; margin-bottom: 10px; }
    .done .row { display: flex; justify-content: center; gap: 18px; }
    .resize {
      position: fixed; display: none; transform: translate(-50%, -50%);
      background: #2e9e4f; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }
    .resize button {
      width: 30px; height: 24px; border: 0; background: none; color: #fff;
      font: 700 16px/1 system-ui, sans-serif; cursor: pointer;
    }
    .resize button:hover { background: rgba(0,0,0,.18); }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1b1d20; border-color: #3a3f45; color: #e6e8ea; }
      input.title { background: #14161a; border-color: #3a3f45; }
      .mode:hover { background: #272a2e; }
      .mode.on { background: #1f3a2a; }
      .hint, .label, .x { color: #9aa1a9; }
    }
  `;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const titleInput = h('input', { class: 'title', type: 'text', placeholder: 'Title' });
  titleInput.value = X.pageMeta().title;
  const saveBtn = h('button', { class: 'save', onclick: save }, 'Save clip');
  const hint = h('div', { class: 'hint' });
  const status = h('div', { class: 'status' });
  const modeButtons = MODES.map((m) => {
    const btn = h('button', { class: 'mode', onclick: () => setMode(m.id) }, h('span', {}, m.label), h('span', { class: 'tick' }));
    btn.dataset.mode = m.id;
    return btn;
  });
  const panel = h('div', { class: 'panel' },
    h('div', { class: 'head' }, h('span', {}, 'Clipper Lite'), h('button', { class: 'x', title: 'Close (Esc)', onclick: destroy }, '×')),
    titleInput,
    saveBtn,
    h('div', { class: 'label' }, 'Clip format'),
    modeButtons,
    hint,
    status,
    h('div', { class: 'foot' }, h('button', { onclick: openLibrary }, 'Open library'))
  );

  const growBtn = h('button', { title: 'Select a larger area', onclick: grow }, '+');
  const shrinkBtn = h('button', { title: 'Select a smaller area', onclick: shrink }, '−');
  const resize = h('div', { class: 'resize' }, growBtn, shrinkBtn);

  shadow.append(style, canvas, resize, panel);
  // Keep clicks and keystrokes inside the panel away from the page's own handlers.
  for (const type of [...POINTER_EVENTS, 'keydown', 'keyup', 'keypress']) {
    shadow.addEventListener(type, (e) => e.stopPropagation());
  }
  document.documentElement.appendChild(host);

  // ---- selection model ----
  const hasContent = (el) => {
    if (/^(SCRIPT|STYLE|NOSCRIPT|LINK|META|TEMPLATE)$/.test(el.tagName)) return false;
    if (!el.getClientRects().length) return false;
    return !!(el.textContent || '').trim() || /^(IMG|VIDEO|PICTURE|CANVAS|SVG)$/i.test(el.tagName) || !!el.querySelector('img,video,picture,canvas,svg');
  };

  // Block-level element under the pointer (skips inline wrappers like span/a/strong).
  function pickTarget(node) {
    let el = node instanceof Element ? node : node && node.parentElement;
    while (el && el !== document.body && el.parentElement) {
      const display = getComputedStyle(el).display;
      const isMedia = /^(IMG|VIDEO|PICTURE|CANVAS|SVG)$/i.test(el.tagName);
      if (isMedia || (display !== 'inline' && display !== 'contents')) break;
      el = el.parentElement;
    }
    if (!el || el === document.body || el === document.documentElement) return null;
    return el;
  }

  // Everything in `ancestor` except `el`: siblings along the path from el up to ancestor.
  function subtract(ancestor, el) {
    const keep = [];
    for (let node = el; node && node !== ancestor; node = node.parentElement) {
      for (const sib of node.parentElement.children) if (sib !== node && hasContent(sib)) keep.push(sib);
    }
    return keep;
  }

  function applyClick(el) {
    if (state.mode === 'article') {
      state.selected = [el];
      state.history = [];
      return;
    }
    const i = state.selected.indexOf(el);
    if (i >= 0) { state.selected.splice(i, 1); return; }
    const ancestor = state.selected.find((s) => s.contains(el));
    if (ancestor) {
      state.selected = state.selected.filter((s) => s !== ancestor).concat(subtract(ancestor, el));
    } else {
      state.selected = state.selected.filter((s) => !el.contains(s));
      state.selected.push(el);
    }
  }

  function grow() {
    const cur = state.selected[0];
    const parent = cur && cur.parentElement;
    if (!parent || parent === document.documentElement) return;
    state.history.push(cur);
    state.selected = [parent];
    refresh();
  }

  function shrink() {
    if (state.history.length) {
      state.selected = [state.history.pop()];
    } else {
      const cur = state.selected[0];
      let best = null;
      let bestLen = 0;
      for (const c of (cur ? cur.children : [])) {
        const len = (c.textContent || '').trim().length;
        if (hasContent(c) && len > bestLen) { best = c; bestLen = len; }
      }
      if (best) state.selected = [best];
    }
    refresh();
  }

  function setMode(id) {
    if (state.mode === id) return;
    state.mode = id;
    state.hover = null;
    status.textContent = '';
    status.className = 'status';
    if (id === 'article') {
      state.selected = [state.auto];
      state.history = [];
    } else if (id === 'multi' && !state.selected.length) {
      state.selected = [state.auto];
    }
    refresh();
  }

  // ---- rendering ----
  function refresh() { dirty = true; renderPanel(); }

  function hasTextSelection() {
    const sel = window.getSelection();
    return !!(sel && !sel.isCollapsed && sel.toString().trim());
  }

  function renderPanel() {
    const mode = MODES.find((m) => m.id === state.mode);
    if (!mode) return; // 'done': the panel now shows the saved message instead
    hint.textContent = mode.hint;
    for (const btn of modeButtons) {
      const on = btn.dataset.mode === state.mode;
      btn.classList.toggle('on', on);
      btn.querySelector('.tick').textContent = on ? '✓' : '';
    }
    const picking = state.mode === 'article' || state.mode === 'multi';
    state.selected = state.selected.filter((el) => el.isConnected);
    saveBtn.disabled = state.busy
      || (picking && !state.selected.length)
      || (state.mode === 'selection' && !hasTextSelection());
  }

  function draw() {
    dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    resize.style.display = 'none';

    if (state.mode === 'article' || state.mode === 'multi') {
      ctx.fillStyle = 'rgba(15,17,20,0.55)';
      ctx.fillRect(0, 0, w, hgt);
      const rects = state.selected.filter((el) => el.isConnected).map((el) => el.getBoundingClientRect());
      for (const r of rects) ctx.clearRect(r.left, r.top, r.width, r.height);
      ctx.strokeStyle = '#2e9e4f';
      ctx.lineWidth = 2;
      for (const r of rects) ctx.strokeRect(r.left + 1, r.top + 1, r.width - 2, r.height - 2);

      if (state.hover && state.hover.isConnected && !state.selected.includes(state.hover)) {
        const r = state.hover.getBoundingClientRect();
        ctx.clearRect(r.left, r.top, r.width, r.height);
        ctx.fillStyle = 'rgba(66,133,244,0.16)';
        ctx.fillRect(r.left, r.top, r.width, r.height);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#4285f4';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.left + 1, r.top + 1, r.width - 2, r.height - 2);
        ctx.setLineDash([]);
      }

      if (state.mode === 'article' && rects.length) {
        const r = rects[0];
        if (r.bottom > 0 && r.top < hgt) {
          const x = Math.min(Math.max(r.left + r.width / 2, 40), w - 40);
          const y = Math.min(r.bottom, hgt - 28);
          resize.style.left = `${x}px`;
          resize.style.top = `${Math.max(y, 28)}px`;
          resize.style.display = 'flex';
        }
      }
    } else if (state.mode === 'fullpage') {
      ctx.strokeStyle = '#2e9e4f';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, hgt - 6);
    }
  }

  function loop() {
    if (destroyed) return;
    if (dirty) draw();
    requestAnimationFrame(loop);
  }

  // ---- events ----
  const markDirty = () => { dirty = true; };
  const picking = () => state.mode === 'article' || state.mode === 'multi';
  const fromPanel = (e) => e.composedPath().includes(host);

  function onPointer(e) {
    if (fromPanel(e) || !picking()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'click') return;
    const el = pickTarget(e.target);
    if (!el) return;
    applyClick(el);
    state.hover = null;
    refresh();
  }

  function onMove(e) {
    if (fromPanel(e) || !picking()) {
      if (state.hover) { state.hover = null; dirty = true; }
      return;
    }
    const el = pickTarget(e.target);
    if (el !== state.hover) { state.hover = el; dirty = true; }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); destroy(); }
  }

  const onSelectionChange = () => { if (state.mode === 'selection') renderPanel(); };

  for (const type of POINTER_EVENTS) window.addEventListener(type, onPointer, true);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', markDirty, { capture: true, passive: true });
  window.addEventListener('resize', markDirty);
  document.addEventListener('selectionchange', onSelectionChange);
  const poll = setInterval(markDirty, 400); // catches layout shifts the page makes on its own

  // ---- actions ----
  function showError(message) {
    status.textContent = message;
    status.className = 'status err';
  }

  async function save() {
    if (state.busy) return;
    state.busy = true;
    renderPanel();
    status.textContent = 'Saving…';
    status.className = 'status';
    try {
      let result;
      if (state.mode === 'article' || state.mode === 'multi') {
        const auto = state.mode === 'article' && state.selected.length === 1 && state.selected[0] === state.auto;
        result = X.extract({ mode: state.mode, elements: state.selected, autoClean: auto });
      } else {
        result = X.extract({ mode: state.mode });
      }
      if (result.error) throw new Error(result.error);
      const title = titleInput.value.trim();
      if (title) result.title = title;
      const reply = await chrome.runtime.sendMessage({ type: 'save-clip', clip: result });
      if (!reply || !reply.ok) throw new Error((reply && reply.error) || 'Could not save the clip.');
      showDone();
    } catch (e) {
      showError(e.message.includes('context invalidated') ? 'The extension was reloaded. Refresh this page and try again.' : e.message);
    } finally {
      state.busy = false;
      if (!destroyed) renderPanel();
    }
  }

  function showDone() {
    state.mode = 'done';
    state.hover = null;
    state.selected = [];
    dirty = true;
    panel.replaceChildren(
      h('div', { class: 'done' },
        h('div', { class: 'ok' }, '✓ Saved to your library'),
        h('div', { class: 'row' },
          h('button', { onclick: () => { openLibrary(); destroy(); } }, 'Open library'),
          h('button', { onclick: destroy }, 'Close')))
    );
    setTimeout(() => { if (!destroyed) destroy(); }, 8000);
  }

  function openLibrary() {
    chrome.runtime.sendMessage({ type: 'open-library' }).catch(() => {});
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearInterval(poll);
    for (const type of POINTER_EVENTS) window.removeEventListener(type, onPointer, true);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', markDirty, { capture: true });
    window.removeEventListener('resize', markDirty);
    document.removeEventListener('selectionchange', onSelectionChange);
    host.remove();
    delete globalThis[KEY];
  }

  // ---- go ----
  globalThis[KEY] = { destroy };
  state.auto = X.detectArticleRoot();
  state.selected = state.auto ? [state.auto] : [];
  // A selection made before opening the picker is almost always what the user wants.
  if (hasTextSelection()) state.mode = 'selection';
  refresh();
  if (state.auto && picking()) state.auto.scrollIntoView({ block: 'nearest' });
  requestAnimationFrame(loop);
})();
