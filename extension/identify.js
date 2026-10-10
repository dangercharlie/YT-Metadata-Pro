// YT Metadata Pro — identification parser.
//
// Pure functions with no DOM or chrome.* access, so the exact same file is loaded as a
// content script (before content.js) and by the Node scripts in scripts/ via `vm`.
//
// The signal: when YouTube has identified music in an upload, the structured description
// panel carries a "Music" card list — `horizontalCardListRenderer.cards[].videoAttributeViewModel`,
// one card per song, each with a "Song credits" dialog. That structure is the same in every
// UI language; the labels ("Song", "1 song", "Titel", "曲") are not, so nothing here matches
// on display text.
//
// @ts-check
(function (root) {
  "use strict";

  /**
   * @typedef {{ song?: string, artist?: string, album?: string, details?: [string, string][] }} Song
   * @typedef {{ state: "identified", songs: Song[], at: number } | { state: "not_identified", at: number }} Result
   */

  /**
   * Pull the data object out of a response body: either an innertube JSON response, or a
   * watch page with `ytInitialData` embedded (as a JS assignment or a JSON script tag).
   * @param {string} text
   * @returns {any}
   */
  function extractData(text) {
    const t = (text || "").trimStart();
    if (!t) return null;
    if (!t.startsWith("<")) return safeParse(t);
    const m =
      /<script[^>]*id="yt-initial-data"[^>]*>(\{.*?\})<\/script>/s.exec(t) ||
      /(?:var |window\[["'])ytInitialData(?:["']\])?\s*=\s*(\{.*?\});\s*<\/script>/s.exec(t);
    return m ? safeParse(m[1]) : null;
  }

  /** @param {string} s */
  function safeParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  /**
   * Classify a `youtubei/v1/next` response or watch page.
   *
   * Returns null when the response is not a usable answer — an interstitial, an error page,
   * a degraded response without the description panel, or data for a different video. The
   * caller treats null as a failure and does NOT cache it, so it is retried later instead
   * of being remembered as "not identified".
   *
   * @param {string} text
   * @param {string} [videoId] expected video; a response for any other video is rejected
   * @returns {Result|null}
   */
  function classify(text, videoId) {
    const data = extractData(text);
    if (!data || typeof data !== "object") return null;

    const servedId = data.currentVideoEndpoint?.watchEndpoint?.videoId;
    if (videoId && servedId && servedId !== videoId) return null;

    const description = (data.engagementPanels || [])
      .map((/** @type {any} */ p) => p?.engagementPanelSectionListRenderer?.content?.structuredDescriptionContentRenderer)
      .find(Boolean);
    if (!description) return null;

    /** @type {Song[]} */
    const songs = [];
    for (const item of description.items || []) {
      // Only card lists count. Games use `videoAttributesSectionViewModel` and chapters use
      // `macroMarkersListItemRenderer` cards, so neither can produce a false positive.
      for (const card of item?.horizontalCardListRenderer?.cards || []) {
        const v = card?.videoAttributeViewModel;
        if (v) songs.push(songFromCard(v));
      }
    }

    const at = Date.now();
    return songs.length ? { state: "identified", songs, at } : { state: "not_identified", at };
  }

  /**
   * @param {any} v videoAttributeViewModel
   * @returns {Song}
   */
  function songFromCard(v) {
    /** @type {Song} */
    const song = {};
    if (typeof v.title === "string" && v.title) song.song = v.title;
    if (typeof v.subtitle === "string" && v.subtitle) song.artist = v.subtitle;
    const album = v.secondarySubtitle?.content;
    if (typeof album === "string" && album) song.album = album;

    const dialog = v.overflowMenuOnTap?.innertubeCommand?.confirmDialogEndpoint?.content?.confirmDialogRenderer;
    const details = parseCreditRuns(dialog?.dialogMessages?.[0]?.runs);
    if (details.length) song.details = details;
    return song;
  }

  /**
   * Turn song-credit dialog runs into [label, value] pairs. Labels are the bold runs
   * followed by a bold ": " run, whatever the language:
   *   {"text":"Song","bold":true},{"text":": ","bold":true},{"text":"Bubbling"},{"text":"\n\n"},...
   * @param {any} runs
   * @returns {[string, string][]}
   */
  function parseCreditRuns(runs) {
    /** @type {[string, string][]} */
    const out = [];
    if (!Array.isArray(runs)) return out;
    for (let i = 0; i < runs.length - 1; i++) {
      const label = runs[i];
      if (!label?.bold || runs[i + 1]?.bold !== true || runs[i + 1]?.text?.trim() !== ":") continue;
      let value = "";
      let j = i + 2;
      for (; j < runs.length && !runs[j]?.bold; j++) value += runs[j]?.text ?? "";
      value = value.trim();
      if (label.text?.trim() && value) out.push([label.text.trim(), value]);
      i = j - 1;
    }
    return out;
  }

  /**
   * Extract a video ID from `/watch?v=...`, `/shorts/...`, or an absolute YouTube URL.
   * @param {string} href
   * @param {string} [base]
   * @returns {string|null}
   */
  function idFromHref(href, base = "https://www.youtube.com") {
    if (!href) return null;
    try {
      const url = new URL(href, base);
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
      const v = url.searchParams.get("v");
      if (url.pathname === "/watch" && v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(url.pathname);
      if (shorts) return shorts[1];
    } catch {
      /* malformed href */
    }
    return null;
  }

  /** @param {string} href */
  function isShortsHref(href) {
    return /^(?:https?:\/\/[^/]*youtube\.com)?\/shorts\//.test(href || "");
  }

  root.YTIdentify = Object.freeze({ classify, extractData, parseCreditRuns, idFromHref, isShortsHref });
})(globalThis);
