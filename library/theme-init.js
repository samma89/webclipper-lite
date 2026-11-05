// Runs synchronously in <head> (before first paint) to avoid a theme flash.
// Kept as a separate file because the extension CSP forbids inline scripts.
try {
  const t = localStorage.getItem('clipfolio.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage unavailable: fall back to prefers-color-scheme */ }
