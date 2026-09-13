# Distribution: Chrome Web Store permissions & GitHub release strategy

Date: 2026-09-12
Status: permissions verified empirically; GitHub guidance based on current policy research

---

## Part 1 — Chrome Web Store permissions

### The shipped manifest is already minimal

```json
{
  "manifest_version": 3,
  "name": "YT Metadata Pro",
  "version": "0.2.0",
  "permissions": ["storage"],
  "action": { "default_popup": "popup.html" },
  "content_scripts": [
    { "matches": ["*://*.youtube.com/*"], "js": ["content.js"], "css": ["badge.css"], "run_at": "document_start" }
  ]
}
```

That is **one API permission and one content-script match pattern**. No `host_permissions`,
no `tabs`, no `activeTab`, no `scripting`, no `<all_urls>`, no `webRequest`.

### `host_permissions` was removed — and that is correct

The manifest previously declared `"host_permissions": ["https://www.youtube.com/*"]`. Chrome
documentation states that content scripts make **same-origin** requests without host
permissions, and that host permissions do not bypass CORS from a content script anyway:

> Cross-origin requests are always treated as such in content scripts, even if the extension
> has host permissions.
> — [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

Because `content.js` calls `/youtubei/v1/next` relative to the page's own origin
(`youtube.com`), that is a same-origin request and `host_permissions` is unnecessary.

**Verified empirically** (Chrome 152, extension loaded via CDP `Extensions.loadUnpacked`):

| Manifest | Result |
|---|---|
| With `host_permissions: ["https://www.youtube.com/*"]` | `panel=YES` |
| **Without** `host_permissions` | `panel=YES` |

Both variants fetched successfully. The shipped manifest (no `host_permissions`) was then
re-tested directly and returned `panel=YES`.

> Testing note: `--load-extension` is ignored by current Chrome (152) and headless mode does
> not load extensions at all. Extensions must be loaded through the DevTools protocol
> (`Extensions.loadUnpacked`), and probes must communicate via the DOM, because content
> scripts run in an **isolated world** — `window` variables set there are not visible to
> `Runtime.evaluate`.

Removing it is better on the merits, not just policy:

- **Fewer install-time warnings.** Chrome shows "Read and change your data on youtube.com"
  for host permissions. Content-script `matches` produce a narrower, more expected prompt.
- **Less review friction.** Broad host permissions attract the highest scrutiny tier;
  narrow ones do not.
- **Smaller blast radius** in any security review.
- **Single-purpose policy.** Requesting permissions the code does not use is explicitly called
  out as a violation (["Extensions quality guidelines FAQ"](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)).
  We no longer request anything unused.

### Store submission checklist

The extension is a good fit for review because it is small, single-purpose, and local-only.
What still needs doing before submitting:

**Manifest / code**
- [ ] Bump `version` (currently `0.2.0`) — the Store requires a higher version per upload.
- [ ] Decide a final `name` (currently "YT Metadata Pro") and keep it consistent with the listing.
- [ ] Add `icons` (16/32/48/128 PNG) — missing icons cause a listing warning and look unpolished.
- [ ] Consider `"minimum_chrome_version"` if you rely on newer APIs.
- [ ] Confirm no remote code: already clean — no `eval`, `new Function`, `importScripts`, or
      external `<script src>`. MV3 forbids remotely hosted code, and this passes.

**Privacy / dashboard**
- [ ] **Privacy tab**: declare data usage. The extension stores a local cache of public video
      metadata and nothing else. It collects no personal data, has no analytics, and sends
      nothing anywhere except YouTube itself from the user's own browser.
- [ ] **Data-use disclosure**: state that you do not sell or transfer data, and that you do
      not use it for purposes unrelated to the single purpose.
- [ ] **Limited Use compliance statement.** Google requires this to be disclosed on a website
      belonging to the extension. If you use any Google API, the policy text is: "The use of
      information received from Google APIs will adhere to the Chrome Web Store User Data
      Policy, including the Limited Use requirements."
- [ ] **Privacy policy URL** — needed because the extension handles data (the local cache).
      A short page on the GitHub repo or a GitHub Pages site is fine.
- [ ] **Single purpose description** — one sentence. Ours: "badge YouTube videos that YouTube
      has identified as a registered musical work".
- [ ] **Justify each permission**: `storage` → "caches identification results locally to avoid
      repeat lookups."

**Listing**
- [ ] Screenshots (1280×800 or 640×400), a 440×280 promo tile if you want it featured.
- [ ] A description that does **not** overclaim. The old README said the badge meant
      "already fingerprinted"; the accurate wording is "YouTube has identified this recording".
- [ ] Set visibility. Unlisted is a useful intermediate: reviewers still check it, updates
      are distributed, and there is no public listing.

**Important honesty point for the listing**

The extension reads an **undocumented internal endpoint**. Store review does not prohibit
this, but the listing must not promise reliability it cannot guarantee. Recommended wording:

> This extension reads YouTube's own metadata to show which videos YouTube has identified as
> registered musical works. It is best-effort and may stop working if YouTube changes how it
> serves this data.

**What is *not* needed here**

- No OAuth, no `identity` permission, no Google Cloud project, no API key.
  (The `licensedContent` design needed an API key; this one does not — a real reduction in
  both user setup and your support burden.)

---

## Part 2 — Releasing on GitHub

### The general consensus

Releasing a Chrome extension primarily on GitHub is **well accepted** for
developer/technical audiences, with a few firmly established norms:

1. **Source in the repo, ready-to-load.** The community expectation is that `git clone` gives
   something loadable via `chrome://extensions` → Load unpacked. Our `prototype-extension/`
   directory satisfies this with zero build step — the repo *is* the artifact.

2. **No build step is a feature.** Extensions that require a toolchain for a simple content
   script are criticised as over-engineered. Ours is plain JS/CSS/HTML, which plays well with
   the "I can audit this in five minutes" expectation.

3. **ZIP releases for convenience.** Attach a ZIP to GitHub Releases so non-developers can
   download → extract → Load unpacked.

4. **Do NOT ship a `.crx` as the primary install path.** Chrome blocks off-store CRX
   installation on Windows and macOS, and sideloaded extensions trigger a
   "Disable developer mode extensions" popup **on every browser start**. Treat `.crx` as a
   niche path and let Load unpacked be the documented route.

5. **Be explicit that it is not from the Web Store.** Users need to know they are installing
   unpacked, why they get a developer-mode prompt, and that Chrome may show an "unsupported
   extension" nag. Say this up front rather than letting users discover it.

6. **Address the "why should I trust this" question directly.** This is the strongest norm for
   a no-store extension, and it is what "build from source" is really about.

### Trust mechanisms that actually matter, in order

1. **Small, readable source.** Already true: ~450 lines of content script, no dependencies,
   no bundler, no minification. This is the single most persuasive thing.
2. **No network destinations besides YouTube.** Verifiable by reading `content.js` — the only
   `fetch` calls are to YouTube's own paths.
3. **No remote code, no `eval`.** MV3-compliant and auditable.
4. **Minimal permissions** — `storage` and a YouTube match pattern, nothing else.
5. **Reproducible builds.** Verified: the ZIP builds **byte-identically** across runs
   (`zip -X` with normalised timestamps gives the same SHA-256). So you can publish a hash
   and users can confirm their local build matches.
6. **GitHub Actions build provenance.** For stronger guarantees, `actions/attest-build-provenance`
   issues signed provenance for build artifacts. Reasonable once the project has users.
7. **Signed commits / tags** (`git tag -s`) if you want source authenticity.

### Recommended repo layout

```
README.md              # install, what it does, what it does NOT do, limitations
extension/             # the shipped v1 (licensedContent) — or archive/remove it
prototype-extension/   # v2 "identified" — the one to promote
scripts/               # probe + parser fixtures
AUDIT.md               # what was wrong with v1
FEASIBILITY.md         # why v2 uses a different signal
DISTRIBUTION.md        # this file
```

Once v2 is the recommended build, **strongly consider retiring or clearly labelling
`extension/`**. Shipping two extensions with contradictory badge semantics in one repo is the
single biggest source of user confusion here — a user could load the old one and get the
`MUSIC` badge on news videos.

### Suggested README section for a GitHub release

```markdown
## Install (unpacked)

1. Download the latest release ZIP and extract it, or clone this repo.
2. Open chrome://extensions/
3. Enable Developer mode (top right).
4. Click "Load unpacked" and select the `prototype-extension/` folder.
5. Reload any open YouTube tabs.

Chrome will warn that this is a developer-mode extension. That is expected for
any extension installed outside the Chrome Web Store.

## Verify the build

The extension is plain JavaScript with no build step and no dependencies — you can
read every file that runs. To confirm a release ZIP matches this source:

    npm run zip:prototype
    shasum -a 256 dist/YT_Metadata_Pro_Identified_Prototype.zip

## What it does not do

- No analytics, no telemetry, no remote servers.
- It only reads public data from YouTube, from your own browser.
- No API key required, and nothing is sent anywhere else.

## Status

Best-effort. It reads an undocumented YouTube endpoint, so it may stop working
if YouTube changes how it serves this data.
```

### Accessibility / maintenance expectations

- **Version the extension and tag releases** (`v0.2.0`). Users on unpacked installs do not get
  auto-updates, so the README must tell them to re-pull or re-download.
- **State the update story.** Unpacked users get no automatic updates — this is a real
  drawback of the GitHub-only route and should be explicit.
- **Keep the fixture test green** (`npm run test:identification`) so a YouTube change can be
  diagnosed and fixed quickly.
- **Expect issues about the dev-mode nag.** It is unavoidable outside the Store.

### The honest tradeoff

| | GitHub only | Chrome Web Store |
|---|---|---|
| Audience | developers, tinkerers | general users |
| Install friction | high (dev mode, nag) | one click |
| Auto-updates | **none** | automatic |
| Review | none | policy review |
| Trust model | "read the source" | "Google reviewed it" |
| Effort | low | privacy policy, listing, review cycles |

The two are not exclusive. The common pattern — and the one I would recommend — is **GitHub
first** (source, ZIP, issue tracker), then submit the same build to the Store as **unlisted**
once it has settled, so you get automatic updates without a public listing.
