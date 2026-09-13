#!/usr/bin/env node
/**
 * compare-providers.mjs — overlay ACRCloud results with the known Suno and YouTube outcomes.
 *
 * Purpose: Suno names three upload-screening vendors (Audible Magic, ACRCloud, Musixmatch).
 * A Suno flag cannot be attributed to one of them directly. Running the same clips through
 * ACRCloud — the only one with a self-serve API — lets us narrow it down:
 *
 *   ACRCloud MATCHes what Suno flagged   -> consistent with ACRCloud producing the flag
 *   ACRCloud passes what Suno flagged    -> the flag more likely came from Audible Magic
 *
 * Usage:
 *   node scripts/compare-providers.mjs acrcloud-results.json
 *
 * Input: the --json output of scripts/acrcloud-test.mjs
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

/**
 * Ground truth for the upload-test set.
 *
 * Keyed by the leading index number in the filename (1-4), because the descriptive
 * filenames do not contain the video ID. Falls back to matching a video ID anywhere
 * in the path, so corpus/clips/<id>_*.mp3 works too.
 */
const BY_INDEX = {
  1: { id: "6tTQ_tThE2Q", youtube: "identified", suno: "FLAGGED", note: "Dire Straits — Sultans of Swing (vinyl rip)" },
  2: { id: "LqjH68SiOuk", youtube: "A-side only", suno: "passed", note: "Aswad Grove 12\" — clip was B-side only" },
  3: { id: "5LkJZbTUJvg", youtube: "NOT identified", suno: "FLAGGED", note: "Aswad Bubbling 12\" Remix (Simba)" },
  4: { id: "L1taQtTWOPw", youtube: "no music", suno: "passed", note: "news video (negative control)" },
};

const BY_ID = Object.fromEntries(Object.values(BY_INDEX).map((v) => [v.id, v]));

/** Resolve a result file back to its corpus entry. */
function entryFor(file) {
  const name = basename(file);
  // 1) leading index number, e.g. "3-the-question_…mp3"
  const m = /^(\d+)[-_]/.exec(name);
  if (m && BY_INDEX[Number(m[1])]) return { id: BY_INDEX[Number(m[1])].id, ...BY_INDEX[Number(m[1])] };
  // 2) video ID anywhere in the path, e.g. "corpus/clips/5LkJZbTUJvg_30s.mp3"
  for (const [id, truth] of Object.entries(BY_ID)) {
    if (file.includes(id)) return { id, ...truth };
  }
  return null;
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/compare-providers.mjs <acrcloud-results.json>");
  process.exit(2);
}

let rows;
try {
  rows = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  console.error(`Could not read ${path}: ${err.message}`);
  process.exit(1);
}

console.log("\nProvider comparison — YouTube vs Suno vs ACRCloud\n");
console.log(
  `${"clip".padEnd(46)}${"YouTube".padEnd(16)}${"Suno".padEnd(10)}${"ACRCloud".padEnd(12)}match`
);
console.log("-".repeat(120));

const summary = { agreeAll: 0, sunoOnly: 0, acrOnly: 0, neither: 0, unknown: 0 };

for (const r of rows) {
  const truth = entryFor(r.file);
  const clip = basename(r.file).slice(0, 44).padEnd(46);
  const yt = (truth?.youtube ?? "?").padEnd(16);
  const suno = (truth?.suno ?? "?").padEnd(10);
  const acr = (r.outcome === "MATCH" ? "MATCH" : r.outcome === "NO_MATCH" ? "no match" : r.outcome).padEnd(12);

  const detail =
    r.outcome === "MATCH" ? `${r.title ?? "?"} — ${r.artists || "?"}${r.score ? ` (${r.score})` : ""}` : "";

  console.log(`${clip}${yt}${suno}${acr}${detail}`);

  // Cross-tab Suno vs ACRCloud (the two we can compare directly)
  if (truth && r.outcome !== "ERROR" && r.outcome !== "REQUEST_FAILED") {
    const sunoFlagged = truth.suno === "FLAGGED";
    const acrMatched = r.outcome === "MATCH";
    if (sunoFlagged && acrMatched) summary.agreeAll++;
    else if (sunoFlagged && !acrMatched) summary.sunoOnly++;
    else if (!sunoFlagged && acrMatched) summary.acrOnly++;
    else summary.neither++;
  } else {
    summary.unknown++;
  }
}

console.log("-".repeat(120));
console.log("\nSuno vs ACRCloud cross-tab");
console.log(`  both flagged/matched        : ${summary.agreeAll}   -> consistent with ACRCloud driving the Suno flag`);
console.log(`  Suno flagged, ACRCloud not  : ${summary.sunoOnly}   -> flag more likely from Audible Magic`);
console.log(`  ACRCloud matched, Suno not  : ${summary.acrOnly}   -> Suno's screening may be narrower than ACRCloud`);
console.log(`  neither                     : ${summary.neither}`);
if (summary.unknown) console.log(`  inconclusive/errors         : ${summary.unknown}`);

console.log("\nHow to read this");
console.log("  ACRCloud is ONE of Suno's three screening vendors. Agreement does not prove");
console.log("  causation, and disagreement does not prove Audible Magic was responsible —");
console.log("  only that ACRCloud alone does not explain the Suno outcome.");
