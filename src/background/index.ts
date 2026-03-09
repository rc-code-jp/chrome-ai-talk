const STORAGE_KEY_OVERLAY_ENABLED = 'chromeAiTalk.overlayEnabled';

chrome.action.onClicked.addListener(async () => {
  const storage = chrome.storage?.local;
  if (!storage) {
    return;
  }

  const stored = await storage.get(STORAGE_KEY_OVERLAY_ENABLED);
  const currentValue = stored[STORAGE_KEY_OVERLAY_ENABLED];
  const overlayEnabled = typeof currentValue === 'boolean' ? currentValue : true;

  await storage.set({ [STORAGE_KEY_OVERLAY_ENABLED]: !overlayEnabled });
});
