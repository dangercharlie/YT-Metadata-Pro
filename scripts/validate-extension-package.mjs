import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../extension");
const requiredFiles = [
  "manifest.json",
  "background.js",
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

if (manifest.background?.service_worker !== "background.js") {
  throw new Error("manifest.json must point to background.js as the service worker.");
}

if (manifest.action?.default_popup !== "popup.html") {
  throw new Error("manifest.json must point to popup.html as the default popup.");
}

const contentScriptFiles = manifest.content_scripts?.flatMap((script) => script.js ?? []) ?? [];
if (!contentScriptFiles.includes("content.js")) {
  throw new Error("manifest.json must include content.js as a content script.");
}

if (!manifest.permissions?.includes("storage")) {
  throw new Error("manifest.json must request storage permission for the local cache.");
}

// The identification signal is fetched same-origin from the content script, so
// host_permissions is NOT required. Requesting it would be an unused permission,
// which the Chrome Web Store treats as a single-purpose violation.
if (manifest.host_permissions !== undefined && manifest.host_permissions.length > 0) {
  throw new Error(
    "manifest.json must not request host_permissions: the content script fetches same-origin and the permission would be unused."
  );
}

// The v1 `licensedContent` design is retired. Guard against it creeping back: that field
// reflects the uploading channel, not whether YouTube identified the recording.
const backgroundContent = fs.readFileSync(path.join(extensionPath, "background.js"), "utf8");
if (backgroundContent.includes("licensedContent")) {
  throw new Error(
    "background.js must not use the retired licensedContent signal (it means 'partner channel', not 'identified')."
  );
}

// The current signal: YouTube's song-credits dialog / Music panel, read from the page.
const contentContent = fs.readFileSync(path.join(extensionPath, "content.js"), "utf8");
if (!contentContent.includes("dialogMessages")) {
  throw new Error("content.js must parse the song-credits dialogMessages payload.");
}
if (!contentContent.includes("/youtubei/v1/next")) {
  throw new Error("content.js must request the innertube next endpoint.");
}
if (!contentContent.includes("/watch?v=")) {
  throw new Error("content.js must retain the watch-page fallback path.");
}

// Scope check: the extension must stay on YouTube.
const matches = manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];
for (const pattern of matches) {
  if (!pattern.includes("youtube.com")) {
    throw new Error(`manifest.json content script scope must stay on youtube.com, found: ${pattern}`);
  }
}

console.log("Extension package validation passed.");
