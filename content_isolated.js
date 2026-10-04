// MeshyGrab Clone - Runs in ISOLATED world
// Acts as bridge between MAIN world hook and Chrome Extension APIs
(function() {
  'use strict';

  // 1. Listen for captured models from MAIN world
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'MESHY_GRAB_MAIN') return;

    if (data.type === 'GLB_CAPTURED' && data.item) {
      try {
        const stored = await chrome.storage.local.get(['captured_models']);
        const list = stored.captured_models || [];

        if (!list.some(x => x.id === data.item.id)) {
          list.unshift(data.item);
          if (list.length > 50) list.pop();
          await chrome.storage.local.set({ captured_models: list });

          chrome.runtime.sendMessage({
            type: 'UPDATE_BADGE',
            count: list.length
          });
        }
      } catch (err) {
        console.error('[MeshyGrab Isolated] Error handling captured model:', err);
      }
    }
  });

  // 2. Listen for download commands from Popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_MODEL_BY_ID') {
      window.postMessage({
        source: 'MESHY_GRAB_POPUP',
        type: 'DOWNLOAD_MODEL',
        id: message.id
      }, '*');
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'DOWNLOAD_ALL_MODELS') {
      window.postMessage({
        source: 'MESHY_GRAB_POPUP',
        type: 'DOWNLOAD_ALL'
      }, '*');
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SET_AUTO_DOWNLOAD') {
      window.postMessage({
        source: 'MESHY_GRAB_POPUP',
        type: 'SET_AUTO_DOWNLOAD',
        enabled: message.enabled
      }, '*');
      sendResponse({ success: true });
      return true;
    }
  });
})();
