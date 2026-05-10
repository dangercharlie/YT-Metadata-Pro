# YT Metadata Pro

YT Metadata Pro is a simple Chrome extension that badges visible YouTube thumbnails when the YouTube Data API reports `contentDetails.licensedContent === true`.

It is intentionally packaged as a plain extension repo. There is no generated React/Vite wrapper and no Google AI Studio dependency.

## Local Testing

1. Run validation:

   ```bash
   npm run validate:extension
   ```

2. Load the extension in Chrome:

   ```text
   chrome://extensions/
   ```

3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `extension/` folder.
6. Open the extension popup and save your own YouTube Data API v3 key.
7. Visit a YouTube search/results page and check for thumbnail badges.

Do not commit API keys or paste them into issues, pull requests, or chat.

## Build A ZIP

```bash
npm run zip
```

The ZIP is written to:

```text
dist/YT_Metadata_Pro_Extension.zip
```

## Scripts

- `npm run validate:extension` checks `extension/manifest.json`, required extension files, and the Content ID Scout lookup markers.
- `npm run lint` currently aliases the extension validator.
- `npm run zip` validates the extension and creates a ZIP package.
