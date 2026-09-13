// YT Metadata Pro prototype — service worker.
//
// The identification signal is fetched same-origin from the content script, so the
// worker has no network role here. It exists to:
//   * clear cached identifications on demand from the popup
//   * keep the optional Data API path (partner signal) available behind a toggle
//
// There is no API key requirement for the primary "IDENTIFIED" signal.

const CACHE_KEY = "ytid:cache:v1";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "clearCache") {
    chrome.storage.local.remove(CACHE_KEY).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) })
    );
    return true;
  }

  if (message?.type === "cacheStats") {
    chrome.storage.local.get(CACHE_KEY).then((stored) => {
      const cache = stored?.[CACHE_KEY] ?? {};
      const entries = Object.values(cache);
      sendResponse({
        ok: true,
        total: entries.length,
        identified: entries.filter((e) => e.state === "identified").length,
      });
    });
    return true;
  }
});
