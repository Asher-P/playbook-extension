(() => {
  let recording = false;
  let steps = [];
  let lastEventTime = 0;
  let overlay = null;
  let pendingName = '';

  // ── Selector builder ──
  function getCssSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
      let selector = node.nodeName.toLowerCase();
      const ariaLabel = node.getAttribute('aria-label');
      const dataTestid = node.getAttribute('data-testid');
      const role = node.getAttribute('role');
      if (dataTestid) {
        selector += `[data-testid="${CSS.escape(dataTestid)}"]`;
        parts.unshift(selector);
        break;
      } else if (ariaLabel) {
        selector += `[aria-label="${CSS.escape(ariaLabel)}"]`;
        parts.unshift(selector);
        break;
      } else if (role) {
        selector += `[role="${role}"]`;
        const idx = Array.from(node.parentNode?.querySelectorAll(selector) || []).indexOf(node);
        if (idx > 0) selector += `:nth-of-type(${idx + 1})`;
      } else {
        const siblings = Array.from(node.parentNode?.children || []).filter(c => c.nodeName === node.nodeName);
        if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(selector);
      node = node.parentNode;
    }
    return parts.join(' > ') || el.nodeName.toLowerCase();
  }

  // ── Floating overlay ──
  function showOverlay(name) {
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = '__wb_recorder_overlay__';
    overlay.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      background: #1a1a2e; color: #e9edef; font-family: -apple-system, sans-serif;
      border-radius: 12px; padding: 14px 16px; min-width: 220px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5); border: 1px solid #f0423f44;
      display: flex; flex-direction: column; gap: 10px; user-select: none;
    `;
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div id="__wb_dot__" style="width:10px;height:10px;border-radius:50%;background:#f0423f;animation:__wb_pulse__ 1s infinite;flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:#f0423f;">Recording</span>
        <span style="font-size:11px;color:#8696a0;margin-left:auto;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</span>
      </div>
      <div id="__wb_step_count__" style="font-size:12px;color:#8696a0;">0 steps captured</div>
      <button id="__wb_stop_btn__" style="
        background:#f0423f;color:#fff;border:none;border-radius:7px;
        padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;
      ">■ Stop &amp; Save</button>
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes __wb_pulse__ { 0%,100%{opacity:1} 50%{opacity:.3} }`;
    overlay.appendChild(style);
    document.body.appendChild(overlay);

    overlay.querySelector('#__wb_stop_btn__').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const recorded = stopRecording();
      removeOverlay();
      chrome.runtime.sendMessage({
        action: 'SAVE_PLAYBOOK',
        name: pendingName || `Playbook ${new Date().toLocaleString()}`,
        steps: recorded
      });
    });
  }

  function updateOverlayCount() {
    const el = document.getElementById('__wb_step_count__');
    if (el) el.textContent = `${steps.filter(s => s.type !== 'wait').length} steps captured`;
  }

  function removeOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  // ── Recording logic ──
  function pushWait() {
    const now = Date.now();
    if (lastEventTime && steps.length) {
      const gap = now - lastEventTime;
      if (gap > 300) steps.push({ type: 'wait', value: gap });
    }
    lastEventTime = now;
  }

  function onMouseDown(e) {
    if (!recording) return;
    // ignore clicks on our own overlay
    if (overlay && overlay.contains(e.target)) return;
    pushWait();
    steps.push({ type: 'click', selector: getCssSelector(e.target) });
    updateOverlayCount();
  }

  let inputBuffer = '';
  let inputTarget = null;
  let inputTimer = null;

  function flushInput() {
    if (inputBuffer && inputTarget) {
      steps.push({ type: 'input', selector: getCssSelector(inputTarget), value: inputBuffer });
      updateOverlayCount();
    }
    inputBuffer = '';
    inputTarget = null;
  }

  function onKeyDown(e) {
    if (!recording) return;
    pushWait();
    const special = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (special.includes(e.key)) {
      flushInput();
      steps.push({ type: 'key', key: e.key });
      updateOverlayCount();
      return;
    }
    if (e.key.length === 1) {
      if (inputTarget !== e.target) { flushInput(); inputTarget = e.target; }
      inputBuffer += e.key;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(flushInput, 600);
    }
  }

  function startRecording(name) {
    steps = [];
    lastEventTime = 0;
    pendingName = name;
    recording = true;
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    showOverlay(name);
  }

  function stopRecording() {
    recording = false;
    clearTimeout(inputTimer);
    flushInput();
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    return steps;
  }

  // ── Message listener ──
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'START_RECORDING') {
      startRecording(msg.name || '');
      sendResponse({ ok: true });
    } else if (msg.action === 'STOP_RECORDING') {
      const recorded = stopRecording();
      removeOverlay();
      sendResponse({ ok: true, steps: recorded });
    }
    return true;
  });
})();
