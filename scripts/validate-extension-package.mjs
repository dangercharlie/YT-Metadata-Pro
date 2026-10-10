import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../extension");
const requiredFiles = [
  "manifest.json",
  "identify.js",
  "content.js",
  "popup.html",
  "popup.js",
  "badge.css",
];

for (const filename of requiredFiles) {
  const filePath = path.join(extensionPath, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Extension package is missing ${filename}.`);
  }
}

const manifestText = fs.readFileSync(path.join(extensionPath, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must declare manifest_version 3.");
}

if (manifest.action?.default_popup !== "popup.html") {
  throw new Error("manifest.json must point to popup.html as the default popup.");
}

const contentScriptFiles = manifest.content_scripts?.flatMap((script) => script.js ?? []) ?? [];
if (!contentScriptFiles.includes("content.js")) {
  throw new Error("manifest.json must include content.js as a content script.");
}
// content.js reads globalThis.YTIdentify, so identify.js must load first in the same entry.
const contentEntry = manifest.content_scripts.find((script) => script.js?.includes("content.js"));
if (contentEntry.js.indexOf("identify.js") === -1 || contentEntry.js.indexOf("identify.js") > contentEntry.js.indexOf("content.js")) {
  throw new Error("manifest.json must load identify.js before content.js in the same content script entry.");
}

if (!manifest.permissions?.includes("storage")) {
  throw new Error("manifest.json must request storage permission for the local cache.");
}

// storage is the only permission the extension uses; anything else would be unused.
const extraPermissions = manifest.permissions.filter((p) => p !== "storage");
if (extraPermissions.length > 0 || manifest.optional_permissions?.length > 0) {
  throw new Error(
    `manifest.json must request only the storage permission, found: ${[
      ...extraPermissions,
      ...(manifest.optional_permissions ?? []),
    ].join(", ")}`
  );
}

// The identification signal is fetched same-origin from the content script, so
// host_permissions is NOT required. Requesting it would be an unused permission,
// which the Chrome Web Store treats as a single-purpose violation.
if (manifest.host_permissions !== undefined && manifest.host_permissions.length > 0) {
  throw new Error(
    "manifest.json must not request host_permissions: the content script fetches same-origin and the permission would be unused."
  );
}

const read = (filename) => fs.readFileSync(path.join(extensionPath, filename), "utf8");
const scripts = fs.readdirSync(extensionPath).filter((f) => f.endsWith(".js"));

// The v1 `licensedContent` design is retired. Guard against it creeping back: that field
// reflects the uploading channel, not whether YouTube identified the recording.
for (const filename of scripts) {
  if (read(filename).includes("licensedContent")) {
    throw new Error(
      `${filename} must not use the retired licensedContent signal (it means 'partner channel', not 'identified').`
    );
  }
}

// No remote code: the Chrome Web Store rejects it, and the "read the source" trust model depends on it.
for (const filename of scripts) {
  if (/\beval\s*\(|new Function\s*\(|importScripts\s*\(/.test(read(filename))) {
    throw new Error(`${filename} must not evaluate code at runtime (eval / new Function / importScripts).`);
  }
}

// The current signal: the structured description panel's music card list, with its
// song-credits dialog, fetched from the innertube endpoint with a watch-page fallback.
const identify = read("identify.js");
if (!identify.includes("videoAttributeViewModel") || !identify.includes("dialogMessages")) {
  throw new Error("identify.js must parse the music card list (videoAttributeViewModel) and its song-credits dialog.");
}
const content = read("content.js");
if (!content.includes("/youtubei/v1/next")) {
  throw new Error("content.js must request the innertube next endpoint.");
}
if (!content.includes("/watch?v=")) {
  throw new Error("content.js must retain the watch-page fallback path.");
}

// Scope check: the extension must stay on YouTube.
const matches = manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];
for (const pattern of matches) {
  if (!/^(\*|https?):\/\/(\*\.|www\.)?youtube\.com\/\*$/.test(pattern)) {
    throw new Error(`manifest.json content script scope must stay on youtube.com, found: ${pattern}`);
  }
}

console.log("Extension package validation passed.");
