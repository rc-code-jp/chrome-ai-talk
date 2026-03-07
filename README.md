# Chrome AI Talk

Chrome extension that wraps `chatgpt.com` with a full-screen robot conversation overlay while keeping the original ChatGPT UI running underneath.

## Current shape

- Manifest V3 content-script extension
- `Vite + React + TypeScript`
- Watches ChatGPT DOM and mirrors messages into a custom overlay
- Sends overlay input back into the hidden ChatGPT composer
- Stores overlay enabled/disabled state in `chrome.storage.local`

## Local run

1. Run `mise install`.
2. Run `npm install`.
3. Run `npm run build`.
4. Open `chrome://extensions`.
5. Enable Developer Mode.
6. Click "Load unpacked" and choose the `dist` directory.

## Notes

- The sync layer currently targets `chatgpt.com` chat pages only.
- Message and composer detection rely on ChatGPT DOM structure and may need selector updates if the site changes.
