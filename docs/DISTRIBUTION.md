# Distribution notes

Preparing a release: Chrome Web Store permissions, and shipping from GitHub.

Date: 2026-09-13 · Permissions verified empirically against the shipped manifest.

---

## Permissions

The manifest is deliberately minimal:

```json
"permissions": ["storage"],
"content_scripts": [{ "matches": ["*://*.youtube.com/*"] }]
```

No `host_permissions`, no `tabs`, no `activeTab`, no `scripting`, no `<all_urls>`.

**Why no `host_permissions`:** the content script fetches same-origin, and
[host permissions do not bypass CORS from a content script anyway](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).
Verified both ways against live YouTube — with and without the permission, the fetch succeeds
identically. Requesting it would be an unused permission, which the
[quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
treat as a single-purpose violation.

### Store submission checklist

**Manifest / code**
- [ ] Bump `version` (currently `2.0.0`) — the Store requires a higher version per upload
- [ ] Add `icons` (16/32/48/128 PNG)
- [ ] Confirm no remote code — already clean: no `eval`, `new Function`, `importScripts`

**Privacy / dashboard**
- [ ] **Privacy tab**: declare data usage. The extension caches public video metadata locally
      and collects nothing else — no analytics, no personal data
- [ ] **Limited Use statement**: "The use of information received from Google APIs will adhere
      to the Chrome Web Store User Data Policy, including the Limited Use requirements"
- [ ] **Privacy policy URL** — required because the extension handles data (the local cache).
      A page on the repo or GitHub Pages is fine
- [ ] **Single purpose description**: "badge YouTube videos that YouTube has identified as a
      registered musical work"
- [ ] **Justify `storage`**: "caches identification results locally to avoid repeat lookups"

**Listing**
- [ ] Screenshots (1280×800 or 640×400)
- [ ] Description that does not overclaim — say "YouTube has identified this recording", not
      "already fingerprinted"
- [ ] Consider **unlisted**: reviewers still check it, updates distribute, no public listing

**Do not promise reliability.** The extension reads an undocumented endpoint. Recommended
wording:

> This extension reads YouTube's own metadata to show which videos YouTube has identified as
> registered musical works. It is best-effort and may stop working if YouTube changes how it
> serves this data.

**Not needed:** no OAuth, no `identity` permission, no Google Cloud project, no API key.

---

## Shipping from GitHub

The extension is plain JS/CSS/HTML with **no build step, no dependencies and no minification** —
the repo *is* the artifact. That is the strongest trust signal available, and it should stay
that way.

**Do:**
- Keep `git clone` → Load unpacked working with zero setup
- Attach a ZIP to GitHub Releases for non-developers
- Say plainly it is not from the Web Store, so users expect the developer-mode prompt

**Don't:**
- **Ship a `.crx` as the install path.** Chrome blocks off-store CRX on Windows and macOS, and
  sideloaded extensions trigger a "Disable developer mode extensions" popup on every startup
- Promise auto-updates — unpacked installs get none. This must be in the README

### Repo layout

```
README.md              # the front door
CHANGELOG.md
extension/             # the shipped extension
docs/
  DISTRIBUTION.md      # this file
scripts/               # detector, tests, corpus tooling
```

### Verify the build

Reproducible: `zip -X` with normalised timestamps produces a **byte-identical** ZIP across
runs, so a published hash can be checked locally.

```bash
npm run lint
npm run zip
shasum -a 256 dist/YT_Metadata_Pro_Extension.zip
```

### GitHub vs Store

| | GitHub only | Chrome Web Store |
|---|---|---|
| Audience | developers, tinkerers | general users |
| Install friction | high (dev mode, warning) | one click |
| Auto-updates | **none** | automatic |
| Review | none | policy review |
| Trust model | "read the source" | "Google reviewed it" |

Not exclusive. The usual path — and the recommended one — is GitHub first, then submit the same
build to the Store as **unlisted** once it has settled.
