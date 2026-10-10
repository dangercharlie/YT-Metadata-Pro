#!/usr/bin/env node
/**
 * test-identification.mjs
 *
 * Tests the identification parser that ships in the extension. extension/identify.js is
 * loaded as-is into a `vm` sandbox, so these tests exercise the exact code Chrome runs.
 *
 * Fixtures in scripts/fixtures/ are real YouTube responses captured 2026-10-11, trimmed to
 * the parts the parser reads. They cover the regressions that matter: non-English UIs
 * (the old parser matched English labels and missed every identified video in other
 * languages), empty credit dialogs, look-alike sections (games, chapters), both watch-page
 * embeddings, and failure pages that must not be cached as "not identified".
 *
 * Run: node scripts/test-identification.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Only the globals identify.js may use; anything else (DOM, chrome.*) would throw here.
const sandbox = { URL };
vm.runInNewContext(fs.readFileSync(path.join(root, "extension/identify.js"), "utf8"), sandbox);
const { classify, idFromHref, isShortsHref, parseCreditRuns } = sandbox.YTIdentify;

const fixture = (name) => fs.readFileSync(path.join(root, "scripts/fixtures", name), "utf8");

/** @type {{ name: string, run: () => unknown, expect: unknown }[]} */
const CASES = [];
const add = (name, run, expect) => CASES.push({ name, run, expect });

// Summarise a result so expectations stay short and timestamps don't matter.
function summary(r) {
  if (!r) return null;
  if (r.state !== "identified") return r.state;
  const s = r.songs[0];
  return { songs: r.songs.length, song: s.song, artist: s.artist, album: s.album, details: s.details?.length ?? 0 };
}

// --- classify: identified
add("multi-song credits (en)", () => summary(classify(fixture("next-en-multi-song-F8lQVA_Pc2w.json"), "F8lQVA_Pc2w")),
  { songs: 2, song: "Astral Traveling", artist: "Pharoah Sanders", album: "Thembi", details: 4 });
add("same video in Japanese UI is still identified", () => summary(classify(fixture("next-ja-multi-song-F8lQVA_Pc2w.json"), "F8lQVA_Pc2w")),
  { songs: 2, song: "Astral Traveling", artist: "Pharoah Sanders", album: "Thembi", details: 4 });
add("German UI, quote in title is unescaped", () => summary(classify(fixture("next-de-escaped-quote-dQw4w9WgXcQ.json"), "dQw4w9WgXcQ")),
  { songs: 1, song: 'Never Gonna Give You Up (7" Mix)', artist: "Rick Astley", album: "Whenever You Need Somebody", details: 4 });
add("empty credits dialog still counts (card is the signal)", () => summary(classify(fixture("next-en-empty-credits-Ppb_Sfh8FEA.json"), "Ppb_Sfh8FEA")),
  { songs: 1, song: "Bubbling", artist: "Aswad", album: "Reggae Greats", details: 0 });
add("watch page, `var ytInitialData` embedding", () => summary(classify(fixture("watch-var-form-mw3kSNIxjqo.html"), "mw3kSNIxjqo")),
  { songs: 1, song: "Patient Zero", artist: "Taylor Swift", album: "The Life of a Showgirl: The Encore", details: 3 });

// --- classify: not identified
add("vinyl rip with no music section", () => summary(classify(fixture("next-en-vinyl-rip-5LkJZbTUJvg.json"), "5LkJZbTUJvg")), "not_identified");
add("games section is not music", () => summary(classify(fixture("next-en-games-section-c9akEr9y7XA.json"), "c9akEr9y7XA")), "not_identified");
add("watch page, JSON script-tag embedding", () => summary(classify(fixture("watch-script-tag-form-c9akEr9y7XA.html"), "c9akEr9y7XA")), "not_identified");
add("chapters card list is not music", () => summary(classify(JSON.stringify({
  engagementPanels: [{ engagementPanelSectionListRenderer: { content: { structuredDescriptionContentRenderer: { items: [
    { horizontalCardListRenderer: { cards: [{ macroMarkersListItemRenderer: { title: { simpleText: "Intro" } } }] } },
  ] } } } }],
}))), "not_identified");
add("music words outside the description panel are ignored", () => summary(classify(JSON.stringify({
  responseContext: { webResponseContextExtensionData: { preloadMessageNames: ["horizontalCardListRenderer", "videoAttributeViewModel"] } },
  contents: { thumbnailBadgeViewModel: { icon: { sources: [{ clientResource: { imageName: "MUSIC" } }] }, text: "14 songs" } },
  engagementPanels: [{ engagementPanelSectionListRenderer: { content: { structuredDescriptionContentRenderer: { items: [] } } } }],
}))), "not_identified");

// --- classify: failures (null = retry later, never cache)
add("degraded response without panels", () => classify(fixture("next-en-degraded-dQw4w9WgXcQ.json"), "dQw4w9WgXcQ"), null);
add("rate-limit / bot-check page", () => classify(fixture("rate-limited-sorry-page.html"), "dQw4w9WgXcQ"), null);
add("response for a different video", () => classify(fixture("next-en-vinyl-rip-5LkJZbTUJvg.json"), "dQw4w9WgXcQ"), null);
add("empty body", () => classify("", "dQw4w9WgXcQ"), null);
add("truncated JSON", () => classify('{"engagementPanels":[', "dQw4w9WgXcQ"), null);

// --- credit runs
add("credit runs: labels in any language, multi-run values", () => parseCreditRuns([
  { text: "曲", bold: true }, { text: ": ", bold: true }, { text: "Astral " }, { text: "Traveling" }, { text: "\n\n" },
  { text: "作詞 / 作曲", bold: true }, { text: ": ", bold: true }, { text: "Lonnie Liston Smith" },
]), [["曲", "Astral Traveling"], ["作詞 / 作曲", "Lonnie Liston Smith"]]);
add("credit runs: label without a value is dropped", () => parseCreditRuns([
  { text: "Album", bold: true }, { text: ": ", bold: true }, { text: "Writers", bold: true }, { text: ": ", bold: true }, { text: "X" },
]), [["Writers", "X"]]);
add("credit runs: missing or empty", () => [parseCreditRuns(undefined), parseCreditRuns([{}])], [[], []]);

// --- hrefs
add("idFromHref", () => [
  "/watch?v=dQw4w9WgXcQ",
  "/watch?v=dQw4w9WgXcQ&list=PL123&index=2",
  "/watch?app=desktop&v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
  "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
  "/shorts/dQw4w9WgXcQ",
  "/shorts/dQw4w9WgXcQ?feature=share",
  "/watch?v=dQw4w9WgXcQX",
  "/watch?v=short",
  "/playlist?list=PL123",
  "/channel/UC123/watch?v=dQw4w9WgXcQ",
  "https://evil.example/watch?v=dQw4w9WgXcQ",
  "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
  "",
].map((h) => idFromHref(h)), [
  "dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ",
  null, null, null, null, null, null, null,
]);
add("isShortsHref", () => ["/shorts/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "/watch?v=dQw4w9WgXcQ"].map(isShortsHref),
  [true, true, false]);

// --- run
let pass = 0;
for (const c of CASES) {
  let got;
  try {
    got = c.run();
  } catch (err) {
    got = `threw: ${err?.message || err}`;
  }
  // Round-trip through JSON so objects created inside the vm sandbox compare by value.
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
  if (!ok) {
    console.log(`      expected ${JSON.stringify(c.expect)}`);
    console.log(`      got      ${JSON.stringify(got)}`);
  }
}
console.log(`\n${pass}/${CASES.length} cases passed`);
process.exit(pass === CASES.length ? 0 : 1);
