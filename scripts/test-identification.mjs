#!/usr/bin/env node
/**
 * test-identification.mjs
 *
 * Fixture-based test for the identification parser used by prototype-extension/content.js.
 * The fixtures are real, trimmed slices of YouTube `youtubei/v1/next` responses.
 *
 * The key regression this guards: a page can contain SEVERAL `dialogMessages` blocks
 * (e.g. "Unsubscribe from X?") and the song-credits block is not reliably the first.
 * An earlier parser anchored on the first block and silently missed credits.
 *
 * Run: node scripts/test-identification.mjs
 */

// --- parser under test (mirrors prototype-extension/content.js) ---
function parseCredits(text) {
  const KEYS = new Set(["Song", "Artist", "Album", "Writers"]);
  for (const block of text.matchAll(/"dialogMessages":\[(.*?)\],"confirmButton"/gs)) {
    const runs = [...block[1].matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const present = runs.filter((r) => KEYS.has(r));
    if (present.length < 2 || !present.includes("Song")) continue;

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

// --- fixtures: real trimmed responses ---
const FIXTURES = [
  {
    name: "credits block is NOT first (regression)",
    text: `"confirmDialogRenderer":{"title":{"runs":[{"text":"Unsubscribe from "}]},"dialogMessages":[{"runs":[{"text":"Unsubscribe from "},{"text":"MrVinylObsessive"},{"text":"?"}]}],"confirmButton":{}}}` +
      `..."confirmDialogRenderer":{"dialogMessages":[{"runs":[{"text":"Song"},{"text":": "},{"text":"Sultans Of Swing"},{"text":"\\n\\n"},{"text":"Artist"},{"text":": "},{"text":"Dire Straits"},{"text":"\\n\\n"},{"text":"Writers"},{"text":": "},{"text":"Mark Knopfler"}]}],"confirmButton":{}}`,
    expect: { Song: "Sultans Of Swing", Artist: "Dire Straits", Writers: "Mark Knopfler" },
  },
  {
    name: "multi-field credits",
    text: `"dialogMessages":[{"runs":[{"text":"Song"},{"text":": "},{"text":"Smooth Operator (Single Version)"},{"text":"\\n\\n"},{"text":"Artist"},{"text":": "},{"text":"Sade"},{"text":"\\n\\n"},{"text":"Album"},{"text":": "},{"text":"The Best of Sade"},{"text":"\\n\\n"},{"text":"Writers"},{"text":": "},{"text":"Helen Folasade Adu, Raymond St. John"}]}],"confirmButton":{}`,
    expect: {
      Song: "Smooth Operator (Single Version)",
      Artist: "Sade",
      Album: "The Best of Sade",
      Writers: "Helen Folasade Adu, Raymond St. John",
    },
  },
  {
    name: "no credits present",
    text: `"dialogMessages":[{"runs":[{"text":"Unsubscribe from "},{"text":"SomeChannel"}]}],"confirmButton":{}`,
    expect: null,
  },
  {
    name: "single Song key is not enough (avoids false positive)",
    text: `"dialogMessages":[{"runs":[{"text":"Song"},{"text":": "},{"text":"Something"}]}],"confirmButton":{}`,
    expect: null,
  },
];

// --- run ---
let pass = 0;
for (const f of FIXTURES) {
  const got = parseCredits(f.text);
  const ok = JSON.stringify(got) === JSON.stringify(f.expect);
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${f.name}`);
  if (!ok) {
    console.log(`      expected ${JSON.stringify(f.expect)}`);
    console.log(`      got      ${JSON.stringify(got)}`);
  }
}
console.log(`\n${pass}/${FIXTURES.length} fixtures passed`);
process.exit(pass === FIXTURES.length ? 0 : 1);
