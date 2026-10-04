// MeshyGrab Clone - Popup Controller
document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const countLabel = document.getElementById('count-label');
  const modelList = document.getElementById('model-list');
  const btnOpenMeshy = document.getElementById('btn-open-meshy');
  const btnClear = document.getElementById('btn-clear');
  const btnDownloadAll = document.getElementById('btn-popup-download-all');
  const autoDlSwitch = document.getElementById('popup-auto-dl');

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Find any Meshy tab
  async function getMeshyTab() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url && activeTab.url.includes('meshy.ai')) {
      return activeTab;
    }
    const allMeshy = await chrome.tabs.query({ url: '*://*.meshy.ai/*' });
    return allMeshy.length > 0 ? allMeshy[0] : null;
  }

  const meshyTab = await getMeshyTab();
  if (meshyTab) {
    statusDot.classList.add('online');
    statusText.textContent = 'Meshy Online';
  } else {
    statusDot.classList.remove('online');
    statusText.textContent = 'Chưa mở Meshy';
  }

  // Load Auto-Download preference (Mặc định TRUE)
  const prefs = await chrome.storage.local.get(['autoDownload']);
  const isAuto = prefs.autoDownload !== undefined ? prefs.autoDownload : true;
  autoDlSwitch.checked = isAuto;

  autoDlSwitch.onchange = async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ autoDownload: enabled });
    const targetTab = await getMeshyTab();
    if (targetTab) {
      chrome.tabs.sendMessage(targetTab.id, { type: 'SET_AUTO_DOWNLOAD', enabled });
    }
  };

  // Render captured models list
  async function renderList() {
    const data = await chrome.storage.local.get(['captured_models']);
    const list = data.captured_models || [];

    countLabel.textContent = `${list.length} files`;
    btnDownloadAll.style.display = list.length > 1 ? 'block' : 'none';

    if (list.length === 0) {
      modelList.innerHTML = '<div class="empty-state">Chưa bắt dc file nào.<br>Hãy mở model 3D trên Meshy.ai lên!</div>';
      return;
    }

    modelList.innerHTML = list.map(item => `
      <div class="model-item">
        <div class="model-details">
          <span class="model-name" title="${item.filename}">${item.filename}</span>
          <span class="model-meta">${formatBytes(item.size)} • ${formatTime(item.timestamp)}</span>
        </div>
        <button class="btn-download" data-id="${item.id}">⬇️ Tải về</button>
      </div>
    `).join('');

    // Attach click events to download buttons
    modelList.querySelectorAll('.btn-download').forEach(btn => {
      btn.onclick = async (e) => {
        const id = e.target.getAttribute('data-id');
        const targetTab = await getMeshyTab();
        if (!targetTab) {
          alert('Không tìm thấy tab Meshy.ai đang mở!\nHãy mở lại tab Meshy chứa model.');
          return;
        }

        e.target.textContent = '⏳ Đang tải...';
        chrome.tabs.sendMessage(targetTab.id, { type: 'DOWNLOAD_MODEL_BY_ID', id }, (response) => {
          setTimeout(() => {
            e.target.textContent = '✅ Đã tải';
            e.target.classList.add('downloaded');
          }, 600);
        });
      };
    });
  }

  btnDownloadAll.onclick = async () => {
    const targetTab = await getMeshyTab();
    if (!targetTab) {
      alert('Không tìm thấy tab Meshy.ai đang mở!\nHãy mở lại tab Meshy chứa model.');
      return;
    }
    btnDownloadAll.textContent = '⏳ Đang tải tất cả...';
    chrome.tabs.sendMessage(targetTab.id, { type: 'DOWNLOAD_ALL_MODELS' }, () => {
      setTimeout(() => {
        btnDownloadAll.textContent = '✅ Đã tải tất cả!';
      }, 1000);
    });
  };

  btnOpenMeshy.onclick = () => {
    chrome.tabs.create({ url: 'https://www.meshy.ai/' });
  };

  btnClear.onclick = async () => {
    await chrome.storage.local.set({ captured_models: [] });
    chrome.action.setBadgeText({ text: '' });
    renderList();
  };

  renderList();
});
