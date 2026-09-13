#!/usr/bin/env node
/**
 * acrcloud-test.mjs — run the corpus clips through ACRCloud's identification API.
 *
 * ACRCloud is one of the three vendors Suno names for upload screening (alongside
 * Audible Magic and Musixmatch). Unlike Audible Magic it has a self-serve trial, so
 * it is the one Suno audio matcher we can test directly.
 *
 * Credentials (from console.acrcloud.com → your project → "Audio & Video Recognition"):
 *   ACRCLOUD_HOST        e.g. identify-eu-west-1.acrcloud.com
 *   ACRCLOUD_ACCESS_KEY
 *   ACRCLOUD_ACCESS_SECRET
 *
 * These are read from the environment only. Never commit them.
 *
 * Usage:
 *   node scripts/acrcloud-test.mjs corpus/upload-test/*.mp3
 *   node scripts/acrcloud-test.mjs corpus/clips/*.mp3
 *   node scripts/acrcloud-test.mjs --json out.json corpus/upload-test/*.mp3
 *
 * Local audio only — sends the file bytes to ACRCloud for identification.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { basename } from "node:path";

const HOST = process.env.ACRCLOUD_HOST;
const ACCESS_KEY = process.env.ACRCLOUD_ACCESS_KEY;
const ACCESS_SECRET = process.env.ACRCLOUD_ACCESS_SECRET;

if (!HOST || !ACCESS_KEY || !ACCESS_SECRET) {
  console.error(
    "Missing ACRCloud credentials.\n\n" +
      "Set all three:\n" +
      "  export ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com\n" +
      "  export ACRCLOUD_ACCESS_KEY=...\n" +
      "  export ACRCLOUD_ACCESS_SECRET=...\n\n" +
      "Find them at console.acrcloud.com → your project → Audio & Video Recognition.\n" +
      "Host varies by region (eu-west-1, us-west-1, ap-southeast-1, …)."
  );
  process.exit(2);
}

// ---- args -------------------------------------------------------------------
const args = process.argv.slice(2);
let jsonOut = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") {
    jsonOut = args[++i];
  } else {
    files.push(args[i]);
  }
}
if (files.length === 0) {
  console.error("Usage: node scripts/acrcloud-test.mjs [--json out.json] <audio files…>");
  process.exit(2);
}

// ---- ACRCloud request signing ----------------------------------------------
// signature = base64(HMAC-SHA1(secret, string_to_sign))
// string_to_sign = "POST\n/v1/identify\n{access_key}\naudio\n1.0\n{timestamp}"
function buildSignature(timestamp) {
  const stringToSign = ["POST", "/v1/identify", ACCESS_KEY, "audio", "1.0", timestamp].join("\n");
  return createHmac("sha1", ACCESS_SECRET).update(stringToSign).digest("base64");
}

async function identify(file) {
  const buf = readFileSync(file);

  // ACRCloud's documented limit is < 1 MB per sample (≈15 s of audio is ideal). Warn
  // rather than silently failing, since an oversized upload can be rejected server-side
  // in a way that looks like a no-match.
  const MAX_BYTES = 1024 * 1024;
  if (buf.length > MAX_BYTES) {
    console.warn(
      `  ! ${basename(file)} is ${(buf.length / 1024 / 1024).toFixed(2)} MB, over ACRCloud's 1 MB limit — ` +
        `trim it first (e.g. ffmpeg -ss 60 -t 15 -i in.mp3 -ac 1 -ar 16000 out.mp3)`
    );
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildSignature(timestamp);

  const form = new FormData();
  form.append("sample", new Blob([buf]), basename(file));
  form.append("sample_bytes", String(buf.length));
  form.append("access_key", ACCESS_KEY);
  form.append("data_type", "audio");
  form.append("signature_version", "1.0");
  form.append("signature", signature);
  form.append("timestamp", timestamp);

  const res = await fetch(`https://${HOST}/v1/identify`, { method: "POST", body: form });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { status: { code: res.status, msg: await res.text().catch(() => "") } };
  }
  return { httpStatus: res.status, body };
}

// ---- interpret --------------------------------------------------------------
/** ACRCloud: status.code 0 = success/match; 1001 = no result. */
function interpret(body) {
  const code = body?.status?.code;
  if (code === 0 && body?.metadata?.music?.length) {
    const m = body.metadata.music[0];
    return {
      outcome: "MATCH",
      title: m.title,
      artists: (m.artists || []).map((a) => a.name).join(", "),
      album: m.album?.name,
      score: m.score,
      acrid: m.acrid,
      playOffset: m.play_offset_ms,
      externalIds: m.external_ids,
      label: m.label,
    };
  }
  if (code === 1001) return { outcome: "NO_MATCH" };
  if (code === 3003) return { outcome: "LIMIT_REACHED", msg: body?.status?.msg };
  return { outcome: "ERROR", code, msg: body?.status?.msg };
}

// ---- run --------------------------------------------------------------------
const results = [];
console.log(`ACRCloud identification — ${files.length} file(s) via ${HOST}\n`);
console.log(`${"file".padEnd(56)}${"outcome".padEnd(12)}match`);
console.log("-".repeat(110));

for (const file of files) {
  let row;
  try {
    const { httpStatus, body } = await identify(file);
    row = { file, httpStatus, ...interpret(body), raw: body };
  } catch (err) {
    row = { file, outcome: "REQUEST_FAILED", msg: err?.message || String(err) };
  }
  results.push(row);

  const short = basename(file).slice(0, 54).padEnd(56);
  const detail =
    row.outcome === "MATCH"
      ? `${row.title ?? "?"} — ${row.artists || "?"}${row.album ? ` [${row.album}]` : ""}${row.score ? ` score=${row.score}` : ""}`
      : row.msg || "";
  console.log(`${short}${row.outcome.padEnd(12)}${detail}`);

  // Be polite: ACRCloud trial quotas are finite.
  await new Promise((r) => setTimeout(r, 1200));
}

const matched = results.filter((r) => r.outcome === "MATCH").length;
const noMatch = results.filter((r) => r.outcome === "NO_MATCH").length;
const errored = results.length - matched - noMatch;

console.log("-".repeat(110));
console.log(`MATCH: ${matched}   NO_MATCH: ${noMatch}   ERROR: ${errored}   (total ${results.length})`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  console.log(`\nRaw responses written to ${jsonOut}`);
}
