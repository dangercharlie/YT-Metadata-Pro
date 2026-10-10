#!/usr/bin/env node
// Check whether YouTube has identified the music in one or more videos, using the same
// parser the extension ships (extension/identify.js).
//
//   node scripts/detect-identified.mjs dQw4w9WgXcQ 5LkJZbTUJvg
//   node scripts/detect-identified.mjs --hl de dQw4w9WgXcQ    # ask for a German UI response
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { URL };
vm.runInNewContext(fs.readFileSync(path.join(root, "extension/identify.js"), "utf8"), sandbox);
const { classify } = sandbox.YTIdentify;

const args = process.argv.slice(2);
let hl = "en";
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--hl") hl = args[++i] ?? hl;
  else ids.push(args[i]);
}
if (!ids.length) {
  console.error("usage: node scripts/detect-identified.mjs [--hl <lang>] <videoId> [...]");
  process.exit(2);
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchNext(videoId) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl, gl: "US" } },
      videoId,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

for (const id of ids) {
  try {
    const result = classify(await fetchNext(id), id);
    if (!result) {
      console.log(`${id}  UNKNOWN (response had no description panel; try again later)`);
    } else if (result.state === "identified") {
      const songs = result.songs.map((s) => [s.artist, s.song].filter(Boolean).join(" – "));
      console.log(`${id}  IDENTIFIED  songs=${songs.length}  ${songs.join(" | ")}`);
    } else {
      console.log(`${id}  NOT-IDENTIFIED`);
    }
  } catch (e) {
    console.log(`${id}  ERROR ${e.message}`);
  }
}
