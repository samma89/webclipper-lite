import { putClip } from './db.js';

export const MODES = ['article', 'fullpage', 'selection'];

// Quick clip with no picker (right-click menu): auto-detect, extract, save.
export async function clipTab(tab, mode) {
  if (!MODES.includes(mode)) throw new Error(`Unknown clip mode: ${mode}`);
  let injection;
  try {
    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ['src/extract.js'] });
    [injection] = await chrome.scripting.executeScript({
      target,
      func: (m) => globalThis.ClipperExtract.extract({ mode: m }),
      args: [mode],
    });
  } catch (e) {
    throw new Error("This page can't be clipped (browser pages and the Web Store are off limits).");
  }
  const result = injection && injection.result;
  if (!result) throw new Error('Nothing could be extracted from this page.');
  if (result.error) throw new Error(result.error);

  const clip = { id: crypto.randomUUID(), createdAt: Date.now(), ...result };
  await putClip(clip);
  return clip;
}
