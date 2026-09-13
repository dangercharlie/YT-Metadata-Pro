// Detect YouTube's music-identification panel via the cheap Innertube 'next' response.
// Signal: YouTube's own "Song credits" dialog / Music panel => the work was IDENTIFIED.
const VIDEO_IDS = process.argv.slice(2);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchNext(videoId) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" } },
      videoId,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Parse the "Song credits" dialog.
 *
 * A page usually carries SEVERAL `dialogMessages` blocks (e.g. "Unsubscribe from X?") and
 * the credits block is NOT reliably first — so scan them all and keep the one that actually
 * carries credit fields. Matching on the run pattern keeps this locale-independent.
 */
function parseCredits(text) {
  const KEYS = new Set(["Song", "Artist", "Album", "Writers"]);
  for (const block of text.matchAll(/"dialogMessages":\[(.*?)\],"confirmButton"/gs)) {
    const runs = [...block[1].matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const present = runs.filter((r) => KEYS.has(r));
    if (present.length < 2 || !present.includes("Song")) continue;

    const out = {};
    for (let i = 0; i < runs.length; i++) {
      if (!KEYS.has(runs[i])) continue;
      const val = runs.slice(i + 1).find((t) => t !== ": " && t.trim() !== "");
      if (val) out[runs[i]] = val;
    }
    if (Object.keys(out).length) return out;
  }
  return null;
}

for (const id of VIDEO_IDS) {
  try {
    const data = await fetchNext(id);
    const text = JSON.stringify(data);
    const credits = parseCredits(text);
    // The music panel header / song-count subtitle also indicate identification.
    const panel = /"subtitle":\{"simpleText":"[0-9]+ songs?"\}/.test(text);
    const songCount = /"simpleText":"([0-9]+) songs?"/.exec(text);
    if (!credits && !panel) {
      console.log(`${id}  NOT-IDENTIFIED`);
      continue;
    }
    const n = songCount
      ? songCount[1]
      : Object.keys(credits ?? {}).length
        ? "1"
        : "?";
    console.log(`${id}  IDENTIFIED  songs=${n}  ${JSON.stringify(credits ?? {})}`);
  } catch (e) {
    console.log(`${id}  ERROR ${e.message}`);
  }
}
