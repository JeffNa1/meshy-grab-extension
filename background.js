// MeshyGrab Clone - Service Worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  console.log('[MeshyGrab Clone] Extension installed successfully.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_BADGE') {
    const text = message.count > 0 ? String(message.count) : '';
    chrome.action.setBadgeText({ text, tabId: sender.tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'DOWNLOAD_URL') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || 'meshy_model.glb',
      saveAs: true
    }, (downloadId) => {
      sendResponse({ success: !!downloadId, downloadId });
    });
    return true;
  }
});
