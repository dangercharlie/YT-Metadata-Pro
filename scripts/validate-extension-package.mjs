import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(__dirname, "../src/App.tsx");
const sourceText = fs.readFileSync(appPath, "utf8");
const sourceFile = ts.createSourceFile(
  appPath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const requiredConstants = new Set([
  "EXTENSION_MANIFEST",
  "BACKGROUND_CONTENT",
  "EXTENSION_CONTENT",
  "POPUP_HTML",
  "POPUP_JS",
]);

const constants = new Map();

function readTemplate(name, initializer) {
  if (ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }

  throw new Error(`${name} must be a static template literal for package validation.`);
}

function visit(node) {
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        requiredConstants.has(declaration.name.text)
      ) {
        constants.set(
          declaration.name.text,
          readTemplate(declaration.name.text, declaration.initializer),
        );
      }
    }
  }

  ts.forEachChild(node, visit);
}

visit(sourceFile);

for (const name of requiredConstants) {
  if (!constants.has(name)) {
    throw new Error(`Missing extension package constant: ${name}`);
  }
}

const manifest = JSON.parse(constants.get("EXTENSION_MANIFEST"));

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

const backgroundContent = constants.get("BACKGROUND_CONTENT");
if (!backgroundContent.includes("videos?part=contentDetails")) {
  throw new Error("background.js must request YouTube video contentDetails.");
}

if (!backgroundContent.includes("contentDetails?.licensedContent === true")) {
  throw new Error("background.js must check contentDetails.licensedContent.");
}

const zip = new JSZip();
zip.file("manifest.json", constants.get("EXTENSION_MANIFEST"));
zip.file("background.js", constants.get("BACKGROUND_CONTENT"));
zip.file("content.js", constants.get("EXTENSION_CONTENT"));
zip.file("popup.html", constants.get("POPUP_HTML"));
zip.file("popup.js", constants.get("POPUP_JS"));

const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
const generatedZip = await JSZip.loadAsync(zipBuffer);

for (const filename of ["manifest.json", "background.js", "content.js", "popup.html", "popup.js"]) {
  if (!generatedZip.file(filename)) {
    throw new Error(`Generated extension ZIP is missing ${filename}.`);
  }
}

JSON.parse(await generatedZip.file("manifest.json").async("string"));

console.log("Extension package validation passed.");
