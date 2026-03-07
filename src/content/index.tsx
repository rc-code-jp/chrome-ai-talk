import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatOverlayApp } from '../ui/ChatOverlayApp';
import { ChatGptDomAdapter } from '../lib/chatgptDomAdapter';
import { STORAGE_KEY_OVERLAY_ENABLED } from '../lib/storage';
import contentStyles from './styles.css?inline';
import overlayStyles from '../ui/styles.css?inline';

function injectStyles() {
  const style = document.createElement('style');
  style.dataset.chromeAiTalk = 'true';
  style.textContent = `${contentStyles}\n${overlayStyles}`;
  document.head.append(style);
}

async function bootstrap() {
  injectStyles();

  const host = document.createElement('div');
  host.id = 'chrome-ai-talk-root';
  document.body.append(host);

  const root = createRoot(host);
  const adapter = new ChatGptDomAdapter();

  let overlayEnabled = true;
  const storage = chrome.storage?.local;

  if (storage) {
    const stored = await storage.get(STORAGE_KEY_OVERLAY_ENABLED);
    if (typeof stored[STORAGE_KEY_OVERLAY_ENABLED] === 'boolean') {
      overlayEnabled = stored[STORAGE_KEY_OVERLAY_ENABLED];
    }
  }

  root.render(
    <React.StrictMode>
      <ChatOverlayApp
        adapter={adapter}
        initialOverlayEnabled={overlayEnabled}
        onOverlayEnabledChange={(enabled) => {
          void storage?.set({ [STORAGE_KEY_OVERLAY_ENABLED]: enabled });
        }}
      />
    </React.StrictMode>,
  );
}

void bootstrap();
