import { clipTab } from './src/clip.js';
import { putClip } from './src/db.js';

const MENU_ITEMS = [
  { id: 'picker', title: 'Clip with picker…', contexts: ['page', 'selection'] },
  { id: 'article', title: 'Quick clip: article', contexts: ['page', 'selection'] },
  { id: 'fullpage', title: 'Quick clip: full page', contexts: ['page', 'selection'] },
  { id: 'selection', title: 'Quick clip: selection', contexts: ['selection'] },
  // Right-click on the toolbar icon. The only way in from pages the picker can't open on.
  { id: 'library', title: 'Open library', contexts: ['action'] },
];

const openLibrary = () => chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html') });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const item of MENU_ITEMS) chrome.contextMenus.create(item);
  });
});

function flash(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2500);
}

async function openPicker(tab) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/extract.js', 'src/picker.js'],
    });
  } catch (e) {
    console.error('Cannot open picker:', e);
    flash(tab.id, '!', '#c62828');
  }
}

chrome.action.onClicked.addListener((tab) => openPicker(tab));

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'library') return openLibrary();
  if (!tab) return;
  if (info.menuItemId === 'picker') return openPicker(tab);
  try {
    await clipTab(tab, info.menuItemId);
    flash(tab.id, '✓', '#2e7d32');
  } catch (e) {
    console.error('Clip failed:', e);
    flash(tab.id, '!', '#c62828');
  }
});

// Messages from the injected picker.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;

  if (msg.type === 'save-clip') {
    const clip = { ...msg.clip, id: crypto.randomUUID(), createdAt: Date.now() };
    putClip(clip).then(
      () => sendResponse({ ok: true, id: clip.id }),
      (e) => sendResponse({ ok: false, error: String(e) })
    );
    return true; // async response
  }

  if (msg.type === 'open-library') {
    openLibrary();
    sendResponse({ ok: true });
  }
});
