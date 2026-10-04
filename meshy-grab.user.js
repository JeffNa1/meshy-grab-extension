// ==UserScript==
// @name         MeshyGrab Clone Pro
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Bắt trộm và tải file model 3D (GLB) trực tiếp từ Meshy.ai không tốn credit
// @author       Antigravity
// @match        https://*.meshy.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Inject code into page context
  const script = document.createElement('script');
  script.textContent = `(${pageContextScript.toString()})();`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  function pageContextScript() {
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
      // Mặc định BẬT tự động tải
      autoDownload: storedAuto === null ? true : storedAuto === 'true'
    };

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
        timestamp: now
      };

      STATE.captured.unshift(item);
      console.log(`%c[MeshyGrab] ✅ Bắt dc GLB: ${filename} (${formatBytes(blob.size)}) từ [${source}]`, 'color:#10b981;font-weight:bold;');
      updateUI();

      if (STATE.autoDownload) {
        console.log(`%c[MeshyGrab] ⚡ Tự động tải xuống: ${filename}`, 'color:#38bdf8;font-weight:bold;');
        downloadBlob(blob, filename);
      }
    }

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
          } catch (err) {}
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
            if (isGLB(buf)) registerCapturedGLB(blob, 'createObjectURL:Magic');
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
              registerCapturedGLB(new Blob([buf], { type: 'model/gltf-binary' }), 'Fetch:Direct');
            }
          } catch (e) {}
        }).catch(() => {});
      }

      return p;
    };

    // --- FLOATING UI ---
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
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            transition: all 0.2s ease;
          }
          .mg-badge-button:hover {
            border-color: #10b981;
            transform: translateY(-2px);
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
          }
          .mg-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            color: #a1a1aa;
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
            <div class="mg-title"><span>📦</span> MeshyGrab Clone Pro</div>
            <button id="mg-btn-close" class="mg-close-btn">✕</button>
          </div>
          <div class="mg-toggle-row">
            <span>Tự động tải khi giải mã:</span>
            <input type="checkbox" id="mg-auto-dl-checkbox" ${STATE.autoDownload ? 'checked' : ''}>
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
          <span id="mg-badge-text">MeshyGrab Pro</span>
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
          setTimeout(() => downloadBlob(item.blob, item.filename), idx * 400);
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
            if (found) downloadBlob(found.blob, found.filename);
          };
        });
      } else {
        dot.classList.remove('active');
        badgeText.textContent = 'MeshyGrab Pro';
        list.innerHTML = '<div class="mg-empty">Đang chờ trang web tạo/mở model...<br><small style="color:#52525b">Mở model 3D trên màn hình để bắt trộm</small></div>';
        btnDlAll.style.display = 'none';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(injectFloatingUI, 1000));
    } else {
      setTimeout(injectFloatingUI, 1000);
    }
  }
})();
