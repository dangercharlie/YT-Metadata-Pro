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
  throw new Error("manifest.json must request storage permission for the API key.");
}

if (!manifest.host_permissions?.includes("https://youtube.googleapis.com/*")) {
  throw new Error("manifest.json must include the YouTube Data API host permission.");
}

const backgroundContent = fs.readFileSync(path.join(extensionPath, "background.js"), "utf8");
if (!backgroundContent.includes("videos?part=contentDetails")) {
  throw new Error("background.js must request YouTube video contentDetails.");
}

if (!backgroundContent.includes("contentDetails?.licensedContent === true")) {
  throw new Error("background.js must check contentDetails.licensedContent.");
}

console.log("Extension package validation passed.");
