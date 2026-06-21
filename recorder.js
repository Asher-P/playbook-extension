(() => {
  let recording = false;
  let steps = [];
  let lastEventTime = 0;

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
    pushWait();
    steps.push({ type: 'click', selector: getCssSelector(e.target) });
  }

  let inputBuffer = '';
  let inputTarget = null;
  let inputTimer = null;

  function flushInput() {
    if (inputBuffer && inputTarget) {
      steps.push({ type: 'input', selector: getCssSelector(inputTarget), value: inputBuffer });
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
      return;
    }
    if (e.key.length === 1) {
      if (inputTarget !== e.target) { flushInput(); inputTarget = e.target; }
      inputBuffer += e.key;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(flushInput, 600);
    }
  }

  function startRecording() {
    steps = [];
    lastEventTime = 0;
    recording = true;
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function stopRecording() {
    recording = false;
    clearTimeout(inputTimer);
    flushInput();
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    return steps;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'START_RECORDING') {
      startRecording();
      sendResponse({ ok: true });
    } else if (msg.action === 'STOP_RECORDING') {
      const recorded = stopRecording();
      sendResponse({ ok: true, steps: recorded });
    }
    return true;
  });
})();
