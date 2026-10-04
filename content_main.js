// MeshyGrab Clone - Injected into MAIN world
(function() {
  'use strict';

  if (window.__meshyGrabInjected) return;
  window.__meshyGrabInjected = true;

  console.log(
    '%c🚀 MeshyGrab Clone Active 🚀%c Hooking Worker, Fetch & ObjectURL...',
    'background:#10b981;color:#000;font-weight:bold;padding:4px 8px;border-radius:4px;',
    'color:#10b981;font-weight:bold;padding-left:6px;'
  );

  const storedAuto = localStorage.getItem('meshy_grab_auto_download');
  const STATE = {
    captured: [],
    // Mặc định BẬT tự động tải để user đéo cần bấm gì cũng có file
    autoDownload: storedAuto === null ? true : storedAuto === 'true',
    uiCollapsed: false
  };

  // --- GLB CHECKER (Magic bytes: 0x67, 0x6c, 0x54, 0x46 => "glTF") ---
  function isGLB(buf) {
    if (!buf || buf.byteLength < 4) return false;
    try {
      const u8 = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, 4);
      return u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46;
    } catch (e) {
      return false;
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  function getCleanModelName() {
    let name = '';
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) {
      name = h1.textContent.trim();
    } else {
      const promptEl = document.querySelector('textarea, input[placeholder*="prompt" i]');
      if (promptEl && promptEl.value) {
        name = promptEl.value.slice(0, 40).trim();
      }
    }

    if (!name) {
      name = 'meshy_model_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    }

    return name.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').trim() + '.glb';
  }

  function downloadBlob(blob, filename) {
    const url = _origCreateObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 15000);
  }

  // --- MODEL REGISTRATION ---
  function registerCapturedGLB(blob, source) {
    const now = Date.now();
    const isDup = STATE.captured.some(item => 
      Math.abs(item.size - blob.size) < 16 && (now - item.timestamp) < 2000
    );
    if (isDup) return;

    const filename = getCleanModelName();
    const item = {
      id: 'glb_' + now + '_' + Math.random().toString(36).slice(2, 7),
      blob: blob,
      filename: filename,
      size: blob.size,
      source: source,
      timestamp: now,
      url: _origCreateObjectURL(blob)
    };

    STATE.captured.unshift(item);
    console.log(`%c[MeshyGrab] ✅ Bắt dc GLB: ${filename} (${formatBytes(blob.size)}) từ [${source}]`, 'color:#10b981;font-weight:bold;');

    // Broadcast to isolated world for extension popup
    window.postMessage({
      source: 'MESHY_GRAB_MAIN',
      type: 'GLB_CAPTURED',
      item: {
        id: item.id,
        filename: item.filename,
        size: item.size,
        source: item.source,
        timestamp: item.timestamp
      }
    }, '*');

    updateUI();

    if (STATE.autoDownload) {
      console.log(`%c[MeshyGrab] ⚡ Tự động tải xuống: ${filename}`, 'color:#38bdf8;font-weight:bold;');
      downloadBlob(blob, filename);
    }
  }

  // --- LISTEN FOR COMMANDS FROM POPUP ---
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'MESHY_GRAB_POPUP') return;

    if (data.type === 'DOWNLOAD_MODEL' && data.id) {
      const found = STATE.captured.find(x => x.id === data.id);
      if (found) {
        console.log(`%c[MeshyGrab] 📥 Tải model theo yêu cầu từ popup: ${found.filename}`, 'color:#10b981;');
        downloadBlob(found.blob, found.filename);
      }
    } else if (data.type === 'DOWNLOAD_ALL') {
      console.log(`%c[MeshyGrab] 📥 Tải tất cả ${STATE.captured.length} models từ popup`, 'color:#10b981;');
      STATE.captured.forEach((item, idx) => {
        setTimeout(() => downloadBlob(item.blob, item.filename), idx * 400);
      });
    } else if (data.type === 'SET_AUTO_DOWNLOAD') {
      STATE.autoDownload = !!data.enabled;
      localStorage.setItem('meshy_grab_auto_download', STATE.autoDownload ? 'true' : 'false');
      const chk = document.getElementById('mg-auto-dl-checkbox');
      if (chk) chk.checked = STATE.autoDownload;
    }
  });

  // --- HOOK 1: Web Worker ---
  const _OrigWorker = window.Worker;
  window.Worker = function MeshyWorkerProxy(scriptURL, options) {
    const w = new _OrigWorker(scriptURL, options);

    function inspectWorkerMessage(e) {
      if (!e || !e.data) return;
      const d = e.data;

      if (d.data && d.data instanceof ArrayBuffer && isGLB(d.data)) {
        try {
          const copy = d.data.slice(0);
          const blob = new Blob([copy], { type: 'model/gltf-binary' });
          registerCapturedGLB(blob, 'Worker:Decrypted');
        } catch (err) {
          console.error('[MeshyGrab] Lỗi sao chép worker buffer:', err);
        }
      }
    }

    const proto = Object.getPrototypeOf(w);
    const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');
    if (desc && desc.set) {
      Object.defineProperty(w, 'onmessage', {
        configurable: true,
        get() { return desc.get ? desc.get.call(w) : undefined; },
        set(fn) {
          desc.set.call(w, function(e) {
            inspectWorkerMessage(e);
            return fn ? fn.call(this, e) : undefined;
          });
        }
      });
    }

    const _origAEL = w.addEventListener.bind(w);
    w.addEventListener = function(type, listener, opts) {
      if (type === 'message') {
        return _origAEL(type, function(e) {
          inspectWorkerMessage(e);
          return listener ? listener.call(this, e) : undefined;
        }, opts);
      }
      return _origAEL(type, listener, opts);
    };

    return w;
  };
  window.Worker.prototype = _OrigWorker.prototype;
  Object.defineProperty(window.Worker, Symbol.hasInstance, {
    value: function(instance) { return instance instanceof _OrigWorker; }
  });

  // --- HOOK 2: URL.createObjectURL ---
  const _origCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(blob) {
    const url = _origCreateObjectURL(blob);
    if (blob instanceof Blob || (typeof File !== 'undefined' && blob instanceof File)) {
      if (blob.type === 'model/gltf-binary') {
        registerCapturedGLB(blob, 'createObjectURL:MIME');
      } else if (blob.size > 2000) {
        blob.slice(0, 8).arrayBuffer().then(buf => {
          if (isGLB(buf)) {
            registerCapturedGLB(blob, 'createObjectURL:Magic');
          }
        }).catch(() => {});
      }
    }
    return url;
  };

  // --- HOOK 3: window.fetch ---
  const _origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isModelCandidate = url.includes('.glb') || url.includes('cdn-models') || url.includes('meshy');
    const p = _origFetch.apply(this, arguments);

    if (isModelCandidate) {
      p.then(async resp => {
        try {
          const clone = resp.clone();
          const buf = await clone.arrayBuffer();
          if (isGLB(buf)) {
            const blob = new Blob([buf], { type: 'model/gltf-binary' });
            registerCapturedGLB(blob, 'Fetch:Direct');
          }
        } catch (e) {}
      }).catch(() => {});
    }

    return p;
  };

  // --- FLOATING UI INJECTION ---
  function injectFloatingUI() {
    if (document.getElementById('meshy-grab-floating-panel')) return;

    const container = document.createElement('div');
    container.id = 'meshy-grab-floating-panel';
    container.innerHTML = `
      <style>
        #meshy-grab-floating-panel {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #f4f4f5;
        }
        .mg-badge-button {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #09090b;
          border: 1px solid #27272a;
          color: #fafafa;
          padding: 10px 16px;
          border-radius: 9999px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          transition: all 0.2s ease;
        }
        .mg-badge-button:hover {
          border-color: #10b981;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -5px rgba(16, 185, 129, 0.3);
        }
        .mg-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #71717a;
        }
        .mg-dot.active {
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }
        .mg-panel {
          width: 340px;
          background: #09090b;
          border: 1px solid #27272a;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 20px 35px -5px rgba(0,0,0,0.7);
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mg-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #27272a;
          padding-bottom: 8px;
        }
        .mg-title {
          font-size: 14px;
          font-weight: 700;
          color: #10b981;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mg-close-btn {
          background: none;
          border: none;
          color: #a1a1aa;
          cursor: pointer;
          font-size: 16px;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .mg-close-btn:hover {
          color: #fff;
          background: #27272a;
        }
        .mg-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #a1a1aa;
        }
        .mg-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
        }
        .mg-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .mg-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #27272a;
          transition: .3s;
          border-radius: 20px;
        }
        .mg-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }
        input:checked + .mg-slider {
          background-color: #10b981;
        }
        input:checked + .mg-slider:before {
          transform: translateX(16px);
        }
        .mg-list {
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mg-item {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 8px;
          padding: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .mg-item-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-width: 190px;
        }
        .mg-item-name {
          font-size: 12px;
          font-weight: 600;
          color: #fafafa;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mg-item-sub {
          font-size: 11px;
          color: #71717a;
        }
        .mg-btn-dl {
          background: #10b981;
          color: #000;
          border: none;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .mg-btn-dl:hover {
          background: #34d399;
        }
        .mg-btn-batch {
          background: #27272a;
          color: #fafafa;
          border: 1px solid #3f3f46;
          border-radius: 8px;
          padding: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s;
        }
        .mg-btn-batch:hover {
          background: #3f3f46;
          border-color: #71717a;
        }
        .mg-empty {
          font-size: 12px;
          color: #71717a;
          text-align: center;
          padding: 16px 8px;
        }
      </style>
      <div id="mg-panel-body" class="mg-panel" style="display: none;">
        <div class="mg-header">
          <div class="mg-title">
            <span>📦</span> MeshyGrab Clone
          </div>
          <button id="mg-btn-close" class="mg-close-btn">✕</button>
        </div>
        <div class="mg-toggle-row">
          <span>Tự động tải khi giải mã:</span>
          <label class="mg-switch">
            <input type="checkbox" id="mg-auto-dl-checkbox" ${STATE.autoDownload ? 'checked' : ''}>
            <span class="mg-slider"></span>
          </label>
        </div>
        <div id="mg-model-list" class="mg-list">
          <div class="mg-empty">Đang chờ trang web tạo/mở model...</div>
        </div>
        <button id="mg-btn-download-all" class="mg-btn-batch" style="display: none;">
          ⬇️ Tải xuống tất cả (.GLB)
        </button>
      </div>

      <div id="mg-badge" class="mg-badge-button">
        <span id="mg-dot" class="mg-dot"></span>
        <span id="mg-badge-text">MeshyGrab Clone</span>
      </div>
    `;

    document.body.appendChild(container);

    const badge = document.getElementById('mg-badge');
    const panel = document.getElementById('mg-panel-body');
    const btnClose = document.getElementById('mg-btn-close');
    const autoDlCheckbox = document.getElementById('mg-auto-dl-checkbox');
    const btnDlAll = document.getElementById('mg-btn-download-all');

    badge.onclick = () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    };

    btnClose.onclick = () => {
      panel.style.display = 'none';
    };

    autoDlCheckbox.onchange = (e) => {
      STATE.autoDownload = e.target.checked;
      localStorage.setItem('meshy_grab_auto_download', e.target.checked ? 'true' : 'false');
    };

    btnDlAll.onclick = () => {
      STATE.captured.forEach((item, idx) => {
        setTimeout(() => {
          downloadBlob(item.blob, item.filename);
        }, idx * 400);
      });
    };

    updateUI();
  }

  function updateUI() {
    const dot = document.getElementById('mg-dot');
    const badgeText = document.getElementById('mg-badge-text');
    const list = document.getElementById('mg-model-list');
    const btnDlAll = document.getElementById('mg-btn-download-all');

    if (!dot || !list) return;

    const count = STATE.captured.length;
    if (count > 0) {
      dot.classList.add('active');
      badgeText.textContent = `Bắt dc ${count} GLB`;
      btnDlAll.style.display = count > 1 ? 'block' : 'none';
      btnDlAll.textContent = `⬇️ Tải tất cả ${count} models (.GLB)`;

      list.innerHTML = STATE.captured.map(item => `
        <div class="mg-item">
          <div class="mg-item-info">
            <span class="mg-item-name" title="${item.filename}">${item.filename}</span>
            <span class="mg-item-sub">${formatBytes(item.size)} • ${item.source}</span>
          </div>
          <button class="mg-btn-dl" data-id="${item.id}">Tải</button>
        </div>
      `).join('');

      list.querySelectorAll('.mg-btn-dl').forEach(btn => {
        btn.onclick = (e) => {
          const id = e.target.getAttribute('data-id');
          const found = STATE.captured.find(x => x.id === id);
          if (found) {
            downloadBlob(found.blob, found.filename);
          }
        };
      });
    } else {
      dot.classList.remove('active');
      badgeText.textContent = 'MeshyGrab (Chờ GLB)';
      list.innerHTML = '<div class="mg-empty">Đang chờ trang web tạo/mở model...<br><small style="color:#52525b">Mở model 3D trên màn hình để bắt trộm</small></div>';
      btnDlAll.style.display = 'none';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectFloatingUI, 1000));
  } else {
    setTimeout(injectFloatingUI, 1000);
  }
})();
