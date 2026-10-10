// YT Metadata Pro — content script.
//
// Finds thumbnail links on YouTube pages, asks YouTube's own `next` endpoint whether each
// on-screen video has an identified musical work (parsing lives in identify.js), and badges
// the thumbnail when it has.
//
// Design points:
//   * Badge state is derived from the video a thumbnail link CURRENTLY points at. YouTube
//     recycles result nodes, so every sync re-reads the href instead of trusting old state.
//   * DOM work is driven by a MutationObserver and one pass over the thumbnail links — cost
//     is proportional to what's on the page, not to the size of the cache.
//   * Lookups are same-origin, limited to thumbnails on (or about to scroll onto) the
//     screen, deduped and concurrency-capped. Failures are never cached; retries are bounded
//     and lookups pause entirely when YouTube starts rate-limiting.
//   * Only confirmed identifications are badged; unknown or failed lookups show nothing.
//
// @ts-check
(function () {
  "use strict";

  const { classify, idFromHref, isShortsHref } = /** @type {any} */ (globalThis).YTIdentify;

  const LOG_PREFIX = "[YT-Metadata-Pro]";
  const ENTRY_PREFIX = "ytid:v:";
  const SETTINGS_KEY = "ytid:settings";
  const LEGACY_CACHE_KEY = "ytid:cache:v1";
  const DEFAULT_SETTINGS = { enabled: true, dimIdentified: false };

  const MAX_CONCURRENT = 4;
  const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000; // re-check "not identified" after 6h
  const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // identifications are stable
  const MAX_STORED_ENTRIES = 4000;
  const MAX_RETRIES = 3;
  const RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;
  const FAILURES_BEFORE_PAUSE = 5;
  const FALLBACK_CLIENT_VERSION = "2.20240101.00.00";

  // Thumbnail links, across the layouts YouTube currently serves:
  //   a#thumbnail                      search results and older grids (inside ytd-thumbnail)
  //   a.ytLockupViewModelContentImage  home grid, watch-page sidebar, newer lockups
  //   a.reel-item-endpoint             Shorts (skipped: YouTube doesn't expose identification for them)
  const THUMB_LINK = "a#thumbnail, a.ytLockupViewModelContentImage, a.reel-item-endpoint";
  // The result "card" a link belongs to — used for dimming.
  const ITEM = [
    "yt-lockup-view-model",
    "ytd-video-renderer",
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
  ].join(",");
  const AD = "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer";
  // Playlists and mixes link to their first video; badging them by it would mislead.
  const COLLECTION_INSIDE = "yt-collection-thumbnail-view-model"; // newer lockups: inside the link
  const COLLECTION_AROUND = "ytd-playlist-thumbnail, ytd-playlist-renderer, ytd-radio-renderer, ytd-grid-playlist-renderer"; // older layouts

  /**
   * @typedef {{ song?: string, artist?: string, album?: string, details?: [string, string][] }} Song
   * @typedef {{ state: "identified"|"not_identified", songs?: Song[], count?: number, at: number }} Entry
   */

  /** @type {Map<string, Entry>} */
  const cache = new Map();
  /** @type {Set<string>} */
  const inFlight = new Set();
  /** @type {string[]} */
  const pending = [];
  /** @type {Map<string, {attempts: number, nextAt: number}>} */
  const retries = new Map();
  /** Videos whose lookup failed MAX_RETRIES times; tried again after a reload or cache clear. */
  const gaveUp = new Set();
  /** @type {Set<HTMLAnchorElement>} */
  const visibleLinks = new Set();
  /** The video ID each link pointed at when last synced, to detect recycled nodes. */
  const linkIds = new WeakMap();

  let settings = { ...DEFAULT_SETTINGS };
  let active = 0;
  let consecutiveFailures = 0;
  let pausedUntil = 0;
  let clientVersion = "";
  let stopped = false;

  // ---------------------------------------------------------------- storage

  /** @param {Entry|undefined} entry */
  function isFresh(entry) {
    if (!entry) return false;
    const ttl = entry.state === "identified" ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
    return Date.now() - entry.at < ttl;
  }

  /** @param {string} id */
  function freshEntry(id) {
    const entry = cache.get(id);
    return isFresh(entry) ? entry : undefined;
  }

  function contextAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  async function loadStorage() {
    try {
      const all = await chrome.storage.local.get(null);
      settings = { ...DEFAULT_SETTINGS, ...all[SETTINGS_KEY] };

      const stale = [LEGACY_CACHE_KEY].filter((k) => k in all);
      /** @type {[string, Entry][]} */
      const entries = [];
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(ENTRY_PREFIX)) continue;
        if (isFresh(value)) entries.push([key.slice(ENTRY_PREFIX.length), value]);
        else stale.push(key);
      }
      // Keep storage bounded: drop the oldest entries beyond the cap.
      entries.sort((a, b) => b[1].at - a[1].at);
      for (const [id] of entries.splice(MAX_STORED_ENTRIES)) stale.push(ENTRY_PREFIX + id);
      for (const [id, entry] of entries) cache.set(id, entry);
      if (stale.length) chrome.storage.local.remove(stale).catch(() => {});
      console.debug(LOG_PREFIX, "cache loaded:", cache.size, "entries");
    } catch (err) {
      console.warn(LOG_PREFIX, "cache load failed:", err);
    }
  }

  /** Entries waiting to be written. One key per video, so tabs never overwrite each other. */
  const dirty = new Map();
  let saveTimer = 0;

  /** @param {string} id @param {Entry} entry */
  function store(id, entry) {
    cache.set(id, entry);
    dirty.set(ENTRY_PREFIX + id, entry);
    if (!saveTimer) saveTimer = window.setTimeout(flush, 1000);
  }

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!dirty.size || !contextAlive()) return;
    const batch = Object.fromEntries(dirty);
    dirty.clear();
    chrome.storage.local.set(batch).catch((err) => console.warn(LOG_PREFIX, "cache save failed:", err));
  }

  function onStorageChanged(changes, area) {
    if (area !== "local" || stopped) return;
    let cleared = false;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key === SETTINGS_KEY) {
        settings = { ...DEFAULT_SETTINGS, ...newValue };
      } else if (key.startsWith(ENTRY_PREFIX)) {
        const id = key.slice(ENTRY_PREFIX.length);
        if (newValue) {
          cache.set(id, newValue); // found by another tab
        } else {
          cache.delete(id); // cleared from the popup
          gaveUp.delete(id);
          retries.delete(id);
          cleared = true;
        }
      }
    }
    if (cleared) consecutiveFailures = 0;
    scheduleSync(cleared);
  }

  // ---------------------------------------------------------------- lookups

  /**
   * The web client version YouTube expects. Read once from the page's inline config; any
   * plausible version works, so the fallback is fine if the page layout changes.
   */
  function getClientVersion() {
    if (clientVersion) return clientVersion;
    for (const script of document.querySelectorAll("script:not([src])")) {
      const m = /"INNERTUBE_CLIENT_VERSION":"([0-9.]+)"/.exec(script.textContent || "");
      if (m) return (clientVersion = m[1]);
    }
    return FALLBACK_CLIENT_VERSION;
  }

  class RateLimited extends Error {}

  /**
   * Ask YouTube whether this video has an identified musical work.
   *
   * Requests English (`hl: "en"`) so responses are consistent; the parser itself is
   * language-independent. Two paths, both same-origin (no CORS, no API key):
   *   1. `youtubei/v1/next` — the endpoint the YouTube web client itself uses
   *   2. the watch page HTML — server-rendered, so it survives an innertube change
   * Throws if neither gives a usable answer; the caller does NOT cache failures.
   *
   * @param {string} videoId
   * @returns {Promise<Entry>}
   */
  async function fetchIdentification(videoId) {
    const errors = [];

    try {
      const res = await fetch("/youtubei/v1/next?prettyPrint=false", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: getClientVersion(), hl: "en", gl: "US" } },
          videoId,
        }),
      });
      if (res.status === 429) throw new RateLimited("next HTTP 429");
      if (res.ok) {
        const result = classify(await res.text(), videoId);
        if (result) return compact(result);
        errors.push("next: unusable response");
      } else {
        errors.push(`next HTTP ${res.status}`);
      }
    } catch (err) {
      if (err instanceof RateLimited) throw err;
      errors.push(`next ${err?.message || err}`);
    }

    try {
      const res = await fetch(`/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
        credentials: "same-origin",
        headers: { Accept: "text/html" },
      });
      if (res.status === 429) throw new RateLimited("watch HTTP 429");
      if (res.ok) {
        const result = classify(await res.text(), videoId);
        if (result) return compact(result);
        errors.push("watch: unusable response (bot check or layout change?)");
      } else {
        errors.push(`watch HTTP ${res.status}`);
      }
    } catch (err) {
      if (err instanceof RateLimited) throw err;
      errors.push(`watch ${err?.message || err}`);
    }

    throw new Error(errors.join(" | "));
  }

  /**
   * Keep stored entries small: up to 5 songs, credit details for the first one only.
   * @param {any} result
   * @returns {Entry}
   */
  function compact(result) {
    if (result.state !== "identified") return { state: "not_identified", at: result.at };
    const songs = result.songs.slice(0, 5).map((/** @type {Song} */ s, /** @type {number} */ i) =>
      i === 0 ? s : { song: s.song, artist: s.artist, album: s.album }
    );
    return { state: "identified", songs, count: result.songs.length, at: result.at };
  }

  /** @param {string} id */
  function requestCheck(id) {
    if (!settings.enabled || freshEntry(id) || inFlight.has(id) || gaveUp.has(id)) return;
    const retry = retries.get(id);
    if (retry && Date.now() < retry.nextAt) return;
    const i = pending.indexOf(id);
    if (i !== -1) pending.splice(i, 1);
    pending.push(id); // newest last: pump() serves the most recently seen first
    pump();
  }

  function visibleIds() {
    const ids = new Set();
    for (const link of visibleLinks) {
      const id = linkIds.get(link);
      if (id) ids.add(id);
    }
    const watchId = currentWatchId();
    if (watchId) ids.add(watchId);
    return ids;
  }

  function pump() {
    if (!settings.enabled || stopped || Date.now() < pausedUntil) return;
    let onScreen = null;
    while (active < MAX_CONCURRENT && pending.length) {
      const id = /** @type {string} */ (pending.pop());
      if (freshEntry(id) || inFlight.has(id)) continue;
      // Scrolled past before its turn came: drop it; it's re-queued if it comes back.
      onScreen ??= visibleIds();
      if (!onScreen.has(id)) continue;

      inFlight.add(id);
      active++;
      fetchIdentification(id)
        .then((entry) => {
          consecutiveFailures = 0;
          retries.delete(id);
          store(id, entry);
          scheduleSync();
        })
        .catch((err) => onLookupFailed(id, err))
        .finally(() => {
          inFlight.delete(id);
          active--;
          pump();
        });
    }
  }

  /** @param {string} id @param {any} err */
  function onLookupFailed(id, err) {
    console.info(LOG_PREFIX, "lookup failed for", id, "-", err?.message || err);
    consecutiveFailures++;
    if (err instanceof RateLimited || consecutiveFailures >= FAILURES_BEFORE_PAUSE) {
      // YouTube is pushing back. Stop all lookups for a while instead of hammering it.
      pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
      pending.length = 0;
      console.warn(LOG_PREFIX, `lookups paused for ${RATE_LIMIT_PAUSE_MS / 60000} minutes after repeated failures`);
    }
    const attempts = (retries.get(id)?.attempts ?? 0) + 1;
    if (attempts >= MAX_RETRIES) {
      retries.delete(id);
      gaveUp.add(id);
      return;
    }
    retries.set(id, { attempts, nextAt: Date.now() + 5_000 * 3 ** (attempts - 1) }); // 5s, 15s
  }

  /** Re-queue visible videos whose retry backoff has elapsed. */
  function retryDue() {
    if (!retries.size) return;
    const onScreen = visibleIds();
    const now = Date.now();
    for (const [id, r] of retries) {
      if (now >= r.nextAt && onScreen.has(id)) requestCheck(id);
    }
  }

  // ---------------------------------------------------------------- page scanning

  /**
   * The video a thumbnail link currently shows, or null if it isn't something we check
   * (playlists/mixes, ads, Shorts, non-video links).
   * @param {HTMLAnchorElement} link
   */
  function videoIdFor(link) {
    const href = link.getAttribute("href") || "";
    if (isShortsHref(href)) return null;
    if (link.querySelector(COLLECTION_INSIDE) || link.closest(COLLECTION_AROUND) || link.closest(AD)) return null;
    return idFromHref(href, location.origin);
  }

  /** Element the badge is placed on: the thumbnail image area itself. */
  function hostFor(link) {
    return /** @type {HTMLElement} */ (
      link.querySelector("yt-thumbnail-view-model") || link.closest("ytd-thumbnail") || link
    );
  }

  const io = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        const link = /** @type {HTMLAnchorElement} */ (record.target);
        if (record.isIntersecting) {
          visibleLinks.add(link);
          const id = linkIds.get(link);
          if (id && !freshEntry(id)) requestCheck(id);
        } else {
          visibleLinks.delete(link);
        }
      }
    },
    { rootMargin: "150px 0px" }
  );
  /** @type {WeakSet<Element>} */
  const observed = new WeakSet();

  /**
   * One pass over every thumbnail link: (re)read the video it points at, fix its badge,
   * and queue a lookup if it's visible and unknown.
   * @param {boolean} [recheck] also re-queue visible videos (after a cache clear)
   */
  function sync(recheck = false) {
    if (stopped) return;
    for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll(THUMB_LINK))) {
      if (!observed.has(link)) {
        observed.add(link);
        io.observe(link);
      }
      const id = videoIdFor(link);
      const changed = linkIds.get(link) !== id;
      linkIds.set(link, id);
      paint(link, id);
      if (id && (changed || recheck) && visibleLinks.has(link) && !freshEntry(id)) requestCheck(id);
    }
    // Links YouTube removed from the page.
    for (const link of visibleLinks) if (!link.isConnected) visibleLinks.delete(link);
    // Badges whose host no longer belongs to a thumbnail link we manage.
    for (const badge of document.querySelectorAll(".ytid-badge:not(.ytid-badge--watch)")) {
      const link = badge.closest("a") || badge.parentElement?.querySelector("a");
      if (!link || !link.matches(THUMB_LINK)) badge.remove();
    }
    syncWatchBadge();
  }

  let syncTimer = 0;
  let syncRecheck = false;
  /** @param {boolean} [recheck] */
  function scheduleSync(recheck = false) {
    syncRecheck ||= recheck;
    if (syncTimer) return;
    syncTimer = window.setTimeout(() => {
      syncTimer = 0;
      const r = syncRecheck;
      syncRecheck = false;
      sync(r);
    }, 150);
  }

  // ---------------------------------------------------------------- badges

  /**
   * @param {HTMLAnchorElement} link
   * @param {string|null} id
   */
  function paint(link, id) {
    const host = hostFor(link);
    const existing = /** @type {HTMLElement|null} */ (host.querySelector(":scope > .ytid-badge"));
    const entry = id ? freshEntry(id) : undefined;
    const identified = settings.enabled && entry?.state === "identified";

    const item = link.closest(ITEM);
    if (item) item.classList.toggle("ytid-dim", identified && settings.dimIdentified);

    if (!identified || !id || !entry) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.ytidVideo === id) return;
    existing?.remove();
    if (getComputedStyle(host).position === "static") host.classList.add("ytid-host");
    host.appendChild(makeBadge(id, entry));
  }

  /**
   * @param {string} id
   * @param {Entry} entry
   * @param {string} [extraClass]
   */
  function makeBadge(id, entry, extraClass = "") {
    const badge = document.createElement("span");
    badge.className = `ytid-badge ${extraClass}`.trim();
    badge.dataset.ytidVideo = id;
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", `Identified by YouTube: ${songLine(entry.songs?.[0]) || "registered musical work"}`);
    badge.textContent = "IDENTIFIED";
    const count = entry.count ?? entry.songs?.length ?? 0;
    if (count > 1) {
      const n = document.createElement("span");
      n.className = "ytid-badge__count";
      n.textContent = String(count);
      badge.appendChild(n);
    }
    return badge; // hover and click are handled page-wide; see onPointerMove / onClick
  }

  /** @param {Song|undefined} s */
  function songLine(s) {
    if (!s) return "";
    return [s.artist, s.song].filter(Boolean).join(" – ");
  }

  /** @param {HTMLElement} badge @param {Entry} entry */
  async function copyCredits(badge, entry) {
    const text = (entry.songs || []).map(songLine).filter(Boolean).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showTooltip(badge, entry, "Copied to clipboard");
    } catch {
      showTooltip(badge, entry, "Couldn't copy");
    }
  }

  // One shared tooltip on <body>, so thumbnails' overflow clipping can't cut it off.
  /** @type {HTMLElement|null} */
  let tooltip = null;

  /**
   * @param {HTMLElement} badge
   * @param {Entry} entry
   * @param {string} [status]
   */
  function showTooltip(badge, entry, status) {
    tooltip ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: "ytid-tooltip" }));
    tooltip.replaceChildren();
    const add = (tag, cls, text) => {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      /** @type {HTMLElement} */ (tooltip).appendChild(el);
      return el;
    };
    const songs = entry.songs || [];
    const count = entry.count ?? songs.length;
    add("div", "ytid-tooltip__title", count > 1 ? `YouTube identified ${count} songs in this upload` : "YouTube identified this music");
    if (!songs.length) add("div", "ytid-tooltip__row", "Registered musical work (no credits listed)");
    songs.forEach((s, i) => {
      const row = add("div", "ytid-tooltip__row", s.song || "Untitled");
      if (s.artist) {
        const artist = document.createElement("span");
        artist.className = "ytid-tooltip__dim";
        artist.textContent = ` — ${s.artist}`;
        row.appendChild(artist);
      }
      if (s.album) add("div", "ytid-tooltip__sub", s.album);
      if (i === 0) {
        for (const [label, value] of s.details || []) {
          if (/^(song|artist|album)$/i.test(label)) continue;
          add("div", "ytid-tooltip__sub", `${label}: ${value}`);
        }
      }
    });
    if (count > songs.length) add("div", "ytid-tooltip__sub", `…and ${count - songs.length} more`);
    add("div", "ytid-tooltip__foot", status || "Click to copy");

    tooltip.hidden = false;
    const r = badge.getBoundingClientRect();
    const t = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - t.width - 8);
    const below = r.bottom + 6 + t.height < window.innerHeight;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - t.height - 6)}px`;
  }

  function hideTooltip() {
    hoveredBadge = null;
    if (tooltip) tooltip.hidden = true;
  }

  // Hover and click are hit-tested page-wide rather than with listeners on the badge: on
  // search results YouTube's inline preview player is laid over the thumbnail as soon as the
  // pointer arrives, so events would go to the player (and a click would open the video).

  /** @type {HTMLElement|null} */
  let hoveredBadge = null;
  let pointer = { x: -1, y: -1 };
  let hoverFrame = 0;

  /** @param {number} x @param {number} y */
  function badgeAt(x, y) {
    for (const badge of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".ytid-badge"))) {
      const r = badge.getBoundingClientRect();
      if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return badge;
    }
    return null;
  }

  /** @param {HTMLElement} badge */
  function entryForBadge(badge) {
    return freshEntry(badge.dataset.ytidVideo || "");
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    pointer = { x: e.clientX, y: e.clientY };
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const badge = badgeAt(pointer.x, pointer.y);
      if (badge === hoveredBadge) return;
      const entry = badge && entryForBadge(badge);
      if (badge && entry) {
        showTooltip(badge, entry);
        hoveredBadge = badge;
      } else if (hoveredBadge) {
        hideTooltip();
      }
    });
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const badge = badgeAt(e.clientX, e.clientY);
    const entry = badge && entryForBadge(badge);
    if (!badge || !entry) return;
    // The badge sits inside the thumbnail link (or under the preview player): copy instead
    // of letting YouTube open the video.
    e.preventDefault();
    e.stopImmediatePropagation();
    copyCredits(badge, entry);
  }

  // ---------------------------------------------------------------- watch page

  function currentWatchId() {
    if (location.pathname !== "/watch") return null;
    return idFromHref(location.pathname + location.search, location.origin);
  }

  /** Badge next to the video title on the watch page itself. */
  function syncWatchBadge() {
    const id = currentWatchId();
    const existing = /** @type {HTMLElement|null} */ (document.querySelector(".ytid-badge--watch"));
    const title = document.querySelector("ytd-watch-metadata #title");
    const entry = id ? freshEntry(id) : undefined;

    if (!id || !settings.enabled || !title || entry?.state !== "identified") {
      existing?.remove();
      if (id && settings.enabled && !entry) requestCheck(id);
      return;
    }
    if (existing?.dataset.ytidVideo === id && existing.parentElement === title) return;
    existing?.remove();
    title.appendChild(makeBadge(id, entry, "ytid-badge--watch"));
  }

  // ---------------------------------------------------------------- popup

  function pageStats() {
    const ids = new Set();
    for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll(THUMB_LINK))) {
      const id = videoIdFor(link);
      if (id) ids.add(id);
    }
    const watchId = currentWatchId();
    if (watchId) ids.add(watchId);
    const stats = { enabled: settings.enabled, identified: 0, notIdentified: 0, pending: 0, failed: 0, pausedUntil };
    for (const id of ids) {
      const entry = freshEntry(id);
      if (entry?.state === "identified") stats.identified++;
      else if (entry) stats.notIdentified++;
      else if (gaveUp.has(id)) stats.failed++;
      else stats.pending++;
    }
    return stats;
  }

  function onMessage(message, _sender, sendResponse) {
    if (message?.type === "pageStats") sendResponse(pageStats());
  }

  // ---------------------------------------------------------------- lifecycle

  /** @type {number[]} */
  const timers = [];
  let mutationObserver = /** @type {MutationObserver|null} */ (null);

  function stop() {
    stopped = true;
    for (const t of timers) clearInterval(t);
    io.disconnect();
    mutationObserver?.disconnect();
  }

  async function init() {
    console.log(`%c${LOG_PREFIX} loaded`, "background:#141414;color:#4ade80;padding:4px;font-weight:bold;");
    await loadStorage();

    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.runtime.onMessage.addListener(onMessage);

    mutationObserver = new MutationObserver(() => scheduleSync());
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });
    document.addEventListener("yt-navigate-finish", () => {
      hideTooltip();
      sync();
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    window.addEventListener("click", onClick, true);
    window.addEventListener("scroll", () => hoveredBadge && hideTooltip(), { capture: true, passive: true });

    timers.push(
      window.setInterval(() => {
        // The extension was reloaded or updated: this copy of the script is orphaned.
        if (!contextAlive()) return stop();
        retryDue();
        pump();
      }, 5000)
    );
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
