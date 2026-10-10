// YT Metadata Pro — popup. Talks to chrome.storage directly and asks the active tab's
// content script for its live counts; no background worker is involved.

const ENTRY_PREFIX = "ytid:v:";
const SETTINGS_KEY = "ytid:settings";
const DEFAULT_SETTINGS = { enabled: true, dimIdentified: false };

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...stored[SETTINGS_KEY] };
}

async function saveSetting(key, value) {
  const settings = await loadSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, [key]: value } });
}

async function refreshCache() {
  const all = await chrome.storage.local.get(null);
  $("cache-total").textContent = String(Object.keys(all).filter((k) => k.startsWith(ENTRY_PREFIX)).length);
}

function showPageMessage(text) {
  for (const id of ["page-identified", "page-not", "page-pending", "page-failed"]) {
    /** @type {HTMLElement} */ ($(id).parentElement).hidden = true;
  }
  $("page-status").hidden = false;
  $("page-status").textContent = text;
}

async function refreshPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return showPageMessage("Open YouTube to see results for a page.");
  let stats;
  try {
    stats = await chrome.tabs.sendMessage(tab.id, { type: "pageStats" });
  } catch {
    // No content script in this tab: not a YouTube page, or opened before the extension loaded.
    return showPageMessage("Open YouTube (or reload the tab) to see results for a page.");
  }
  if (!stats) return showPageMessage("Open YouTube (or reload the tab) to see results for a page.");
  if (!stats.enabled) return showPageMessage("Badges are turned off.");
  $("page-identified").textContent = String(stats.identified);
  $("page-not").textContent = String(stats.notIdentified);
  $("page-pending").textContent = String(stats.pending);
  $("page-failed").textContent = String(stats.failed);
  if (stats.pausedUntil > Date.now()) {
    $("page-status").hidden = false;
    $("page-status").textContent = "YouTube is rate-limiting lookups; paused for a few minutes.";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await loadSettings();
  const enabled = /** @type {HTMLInputElement} */ ($("enabled"));
  const dim = /** @type {HTMLInputElement} */ ($("dim"));
  enabled.checked = settings.enabled;
  dim.checked = settings.dimIdentified;
  enabled.addEventListener("change", async () => {
    await saveSetting("enabled", enabled.checked);
    setTimeout(refreshPage, 150);
  });
  dim.addEventListener("change", () => saveSetting("dimIdentified", dim.checked));

  const clear = /** @type {HTMLButtonElement} */ ($("clear"));
  clear.addEventListener("click", async () => {
    clear.disabled = true;
    try {
      const all = await chrome.storage.local.get(null);
      // Open YouTube tabs see these removals and re-check what's on screen.
      await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(ENTRY_PREFIX)));
      clear.textContent = "Cleared — re-checking open tabs";
    } catch (err) {
      clear.textContent = `Couldn't clear: ${err?.message || err}`;
    }
    await refreshCache();
    setTimeout(() => {
      clear.textContent = "Clear cache & re-check";
      clear.disabled = false;
      refreshPage();
    }, 2000);
  });

  refreshCache();
  refreshPage();
});
