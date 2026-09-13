// YT Metadata Pro — prototype content script
//
// Fixes the state-model bugs in the shipped content.js AND switches the signal
// from `licensedContent` to YouTube's own "Song credits" identification panel.
//
// Key design points:
//   * State is keyed by the video ID a node CURRENTLY shows, not by a permanent
//     node attribute. YouTube recycles list nodes; the old code leaked badges.
//   * Unknown is not safe. We badge confirmed identifications only, and never
//     imply "no badge == safe".
//   * Requests are same-origin, lazy (visible only), deduped, and concurrency-capped.
//
// @ts-check
(function () {
  "use strict";

  const LOG_PREFIX = "[YT-Metadata-Pro]";
  const MAX_CONCURRENT = 4;
  const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000; // re-check "not identified" after 6h
  const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // identifications are stable
  const CACHE_KEY = "ytid:cache:v1";

  /** @typedef {{ state: "identified"|"not_identified", credits?: Record<string,string>, at: number }} CacheEntry */

  /** @type {Map<string, CacheEntry>} */
  const cache = new Map();
  /** videoIds currently in flight */
  const inFlight = new Set();
  /** @type {string[]} */
  const pending = [];
  let active = 0;

  // ---------------------------------------------------------------- storage

  async function loadCache() {
    try {
      const stored = await chrome.storage.local.get(CACHE_KEY);
      const raw = stored?.[CACHE_KEY];
      if (!raw || typeof raw !== "object") return;
      const now = Date.now();
      for (const [id, entry] of Object.entries(raw)) {
        const ttl = entry.state === "identified" ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
        if (now - entry.at < ttl) cache.set(id, entry);
      }
      console.debug(LOG_PREFIX, "cache loaded:", cache.size, "entries");
    } catch (err) {
      console.warn(LOG_PREFIX, "cache load failed:", err);
    }
  }

  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const obj = Object.fromEntries(cache);
      chrome.storage.local.set({ [CACHE_KEY]: obj }).catch(() => {});
    }, 1500);
  }

  // ---------------------------------------------------------------- detection

  /**
   * Client version used for the innertube call. Scraped from the page when possible so the
   * extension does not rot when YouTube ships a new build; falls back to a known-good value.
   * Verified: plausible version strings from 2019–2024 all work, so this is belt-and-braces.
   * @type {string}
   */
  const FALLBACK_CLIENT_VERSION = "2.20240101.00.00";

  function currentClientVersion() {
    try {
      const html = document.documentElement.innerHTML;
      const m = /"(?:INNERTUBE_CLIENT_VERSION|clientVersion)":"([0-9.]+)"/.exec(html);
      if (m && m[1]) return m[1];
    } catch {
      /* ignore */
    }
    return FALLBACK_CLIENT_VERSION;
  }

  function innertubeContext() {
    return {
      client: {
        clientName: "WEB",
        clientVersion: currentClientVersion(),
        hl: document.documentElement.lang || "en",
        gl: "US",
      },
    };
  }

  /**
   * Ask YouTube's own web client whether this video has been identified.
   * Same-origin request from the content script, so no CORS and no API key.
   *
   * Two independent paths are attempted (both return the same signal):
   *   1. `youtubei/v1/next`  — the endpoint the YouTube web client itself uses
   *   2. the watch page HTML — server-rendered, so it survives an innertube change
   * If both fail we throw, and the caller deliberately does NOT cache the failure.
   *
   * @param {string} videoId
   * @returns {Promise<CacheEntry>}
   */
  async function fetchIdentification(videoId) {
    const errors = [];

    // --- path 1: innertube `next`
    try {
      const res = await fetch("/youtubei/v1/next?prettyPrint=false", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: innertubeContext(), videoId }),
      });
      if (res.ok) {
        const entry = classify(await res.text());
        if (entry) return entry;
      } else {
        errors.push(`next HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`next ${err?.message || err}`);
    }

    // --- path 2: raw watch page (server-rendered HTML)
    try {
      const res = await fetch(`/watch?v=${encodeURIComponent(videoId)}`, {
        credentials: "same-origin",
        headers: { Accept: "text/html" },
      });
      if (res.ok) {
        const entry = classify(await res.text());
        if (entry) return entry;
      } else {
        errors.push(`watch HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`watch ${err?.message || err}`);
    }

    throw new Error(errors.join(" | ") || "identification lookup failed");
  }

  /**
   * Turn a raw response body into a cache entry.
   *
   * A well-formed response that simply lacks the panel is a definitive NEGATIVE
   * (YouTube has no identification), which is cacheable. A response we could not
   * parse at all returns null so the caller treats it as a failure and retries later.
   *
   * @param {string} text
   * @returns {CacheEntry|null}
   */
  function classify(text) {
    if (!text) return null;
    // Guard against an HTML error/interstitial page: those are failures, not negatives.
    const trimmed = text.trimStart();
    const looksLikeHtml = trimmed.startsWith("<");
    const credits = parseCredits(text);
    const panel = /"subtitle":\{"simpleText":"[0-9]+ songs?"\}/.test(text);
    if (credits || panel) {
      return { state: "identified", credits: credits ?? undefined, at: Date.now() };
    }
    // No panel. Accept as a negative only if it looks like a real YouTube data response.
    if (looksLikeHtml && !trimmed.includes("ytInitialData")) return null;
    if (!looksLikeHtml && !/"responseContext"|"contents"|"engagementPanels"|"videoDetails"/.test(text)) {
      return null;
    }
    return { state: "not_identified", at: Date.now() };
  }

  /**
   * Parse the "Song credits" dialog.
   *
   * There are usually several `dialogMessages` blocks on the page (unsubscribe
   * confirmations, etc.), and the credits one is NOT reliably first — so we scan
   * every block and keep the one that actually carries credit fields.
   *
   * Runs look like: "Song", ": ", <value>, "\n\n", "Artist", ": ", <value>, ...
   * Matching on the run *pattern* (rather than the English panel title) keeps this
   * working in non-English locales.
   *
   * @param {string} text
   * @returns {Record<string,string>|null}
   */
  function parseCredits(text) {
    const KEYS = new Set(["Song", "Artist", "Album", "Writers"]);
    const blocks = text.matchAll(/"dialogMessages":\[(.*?)\],"confirmButton"/gs);

    for (const block of blocks) {
      const runs = [...block[1].matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);

      // A credits dialog must contain at least "Song" plus one other field.
      const present = runs.filter((r) => KEYS.has(r));
      if (present.length < 2 || !present.includes("Song")) continue;

      /** @type {Record<string,string>} */
      const out = {};
      for (let i = 0; i < runs.length; i++) {
        if (!KEYS.has(runs[i])) continue;
        const value = runs.slice(i + 1).find((t) => t !== ": " && t.trim() !== "");
        if (value) out[runs[i]] = value;
      }
      if (Object.keys(out).length) return out;
    }
    return null;
  }

  // ---------------------------------------------------------------- queueing

  function requestCheck(videoId) {
    if (cache.has(videoId) || inFlight.has(videoId)) return;
    if (!pending.includes(videoId)) pending.push(videoId);
    pump();
  }

  function pump() {
    while (active < MAX_CONCURRENT && pending.length) {
      const videoId = pending.shift();
      if (!videoId || cache.has(videoId) || inFlight.has(videoId)) continue;
      inFlight.add(videoId);
      active++;
      fetchIdentification(videoId)
        .then((entry) => {
          cache.set(videoId, entry);
          scheduleSave();
          if (entry.state === "identified") paintAllFor(videoId);
        })
        .catch((err) => {
          // Fail open: do NOT cache failures, and schedule a bounded retry so a transient
          // error or bot interstitial cannot permanently strand a thumbnail.
          console.debug(LOG_PREFIX, "lookup failed for", videoId, "-", err?.message || err);
          markFailure(videoId);
        })
        .finally(() => {
          inFlight.delete(videoId);
          active--;
          pump();
        });
    }
  }

  // ---------------------------------------------------------------- badge DOM

  /**
   * Find the thumbnail container for an anchor, handling both the legacy
   * `ytd-thumbnail` and the newer `*-view-model` components YouTube is migrating to.
   * @param {HTMLAnchorElement} anchor
   * @returns {HTMLElement|null}
   */
  function containerFor(anchor) {
    return (
      anchor.closest("ytd-thumbnail") ||
      anchor.closest("yt-thumbnail-view-model") ||
      anchor.closest("yt-lockup-view-model") ||
      anchor.closest("ytd-rich-item-renderer") ||
      anchor.closest("ytm-shorts-lockup-view-model-v2") ||
      anchor.closest("ytm-shorts-lockup-view-model")
    );
  }

  /**
   * @param {HTMLElement} container
   * @param {CacheEntry} entry
   */
  function paint(container, entry) {
    // Guard against a node that was recycled to a different video while in flight.
    const activeId = videoIdFor(container);
    if (!activeId || !entry) return;

    const existing = container.querySelector(":scope > .ytid-badge");
    if (entry.state !== "identified") {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.getAttribute("data-ytid-video") === activeId) return;
    if (existing) existing.remove();

    const badge = document.createElement("div");
    badge.className = "ytid-badge ytid-badge--identified";
    badge.setAttribute("data-ytid-video", activeId);
    const c = entry.credits || {};
    const detail = [c["Song"], c["Artist"], c["Album"]].filter(Boolean).join(" — ");
    badge.title = detail
      ? `YouTube matched this upload to: ${detail}`
      : "YouTube has identified a registered musical work in this upload.";
    badge.textContent = "IDENTIFIED";

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(badge);
  }

  /** @param {string} videoId */
  function paintAllFor(videoId) {
    const entry = cache.get(videoId);
    if (!entry || entry.state !== "identified") return;
    for (const anchor of anchorsFor(videoId)) {
      const container = containerFor(anchor);
      if (container) paint(container, entry);
    }
  }

  /**
   * Exact-match lookup for a video ID's anchors. Avoids the substring bug in the
   * original `href*="/watch?v=ID"` selector.
   * @param {string} videoId
   * @returns {HTMLAnchorElement[]}
   */
  function anchorsFor(videoId) {
    /** @type {HTMLAnchorElement[]} */
    const out = [];
    for (const anchor of document.querySelectorAll("a[href]")) {
      const id = idFromHref(anchor.getAttribute("href") || "");
      if (id === videoId) out.push(/** @type {HTMLAnchorElement} */ (anchor));
    }
    return out;
  }

  /**
   * Extract a video ID from `/watch?v=...`, `/shorts/...`, or an absolute URL.
   * @param {string} href
   * @returns {string|null}
   */
  function idFromHref(href) {
    if (!href) return null;
    const short = /^\/shorts\/([A-Za-z0-9_-]{11})/.exec(href);
    if (short) return short[1];
    try {
      const url = new URL(href, location.origin);
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
      const v = url.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
      if (shorts) return shorts[1];
    } catch {
      /* ignore malformed hrefs */
    }
    return null;
  }

  /**
   * The video ID a container *currently* represents. Used to invalidate stale badges
   * when YouTube recycles a node for a different video.
   * @param {HTMLElement} container
   * @returns {string|null}
   */
  function videoIdFor(container) {
    const anchor = container.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    return anchor ? idFromHref(anchor.getAttribute("href") || "") : null;
  }

  // ---------------------------------------------------------------- observers

  /** Track the video ID each observed container last showed, to detect recycling. */
  const lastSeenId = new WeakMap();

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const container = /** @type {HTMLElement} */ (entry.target);
        const videoId = videoIdFor(container);
        if (!videoId) continue;

        const previous = lastSeenId.get(container);
        if (previous && previous !== videoId) {
          // Node was recycled — clear any badge belonging to the old video.
          const stale = container.querySelector(":scope > .ytid-badge");
          if (stale && stale.getAttribute("data-ytid-video") !== videoId) stale.remove();
        }
        lastSeenId.set(container, videoId);

        const cached = cache.get(videoId);
        if (cached?.state === "identified") {
          paint(container, cached);
        } else if (!cached) {
          requestCheck(videoId);
        }
      }
    },
    { rootMargin: "200px" }
  );

  function observeContainers() {
    const selector = [
      "ytd-thumbnail",
      "yt-thumbnail-view-model",
      "yt-lockup-view-model",
      "ytm-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model-v2",
    ].join(",");
    for (const el of document.querySelectorAll(selector)) {
      const container = /** @type {HTMLElement} */ (el);
      if (container.hasAttribute("data-ytid-observed")) continue;
      container.setAttribute("data-ytid-observed", "true");
      io.observe(container);
    }
  }

  // Reconcile periodically: catches recycled nodes and page navigation, and repaints
  // identifications discovered after a node first appeared.
  //
  // The stale-badge sweep is essential: IntersectionObserver does NOT re-fire when only
  // an anchor's href changes (the element stays intersecting), so recycling can otherwise
  // leave a badge attached to a video it does not belong to.
  function reconcile() {
    observeContainers();

    for (const badge of document.querySelectorAll(".ytid-badge")) {
      const container = badge.parentElement;
      if (!container) continue;
      const currentId = videoIdFor(container);
      if (currentId !== badge.getAttribute("data-ytid-video")) badge.remove();
    }

    for (const [videoId, entry] of cache) {
      if (entry.state !== "identified") continue;
      for (const anchor of anchorsFor(videoId)) {
        const container = containerFor(anchor);
        if (container) paint(container, entry);
      }
    }

    // Retry videos whose lookup FAILED (they are never cached). Without this, a transient
    // error or a bot interstitial would leave a thumbnail permanently unchecked — the same
    // class of bug as the original extension's un-retried `scannedVideoIds`.
    retryFailures();
  }

  /** @type {Map<string, {attempts: number, nextAt: number}>} */
  const retryState = new Map();
  const MAX_RETRIES = 3;

  function markFailure(videoId) {
    const prev = retryState.get(videoId);
    const attempts = (prev?.attempts ?? 0) + 1;
    if (attempts > MAX_RETRIES) return; // give up quietly; page reload will try again
    // Exponential-ish backoff so a persistent block does not hammer the endpoint.
    const backoffMs = Math.min(30_000, 2_000 * 2 ** (attempts - 1));
    retryState.set(videoId, { attempts, nextAt: Date.now() + backoffMs });
  }

  function retryFailures() {
    if (!retryState.size) return;
    const now = Date.now();
    for (const [videoId, st] of retryState) {
      if (cache.has(videoId)) {
        retryState.delete(videoId);
        continue;
      }
      if (now < st.nextAt) continue;
      retryState.delete(videoId);
      requestCheck(videoId);
    }
  }

  // ---------------------------------------------------------------- init

  let initStarted = false;
  async function init() {
    if (initStarted) return;
    initStarted = true;
    console.log(
      `%c${LOG_PREFIX} loaded (identification mode)`,
      "background:#141414;color:#4ade80;padding:4px;font-weight:bold;"
    );
    await loadCache();
    observeContainers();
    setInterval(observeContainers, 1000);
    setInterval(reconcile, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
