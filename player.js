async function waitForElement(selector, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function playSteps(steps) {
  for (const step of steps) {
    if (step.type === 'wait') {
      await sleep(Math.min(step.value, 5000));
      continue;
    }
    if (step.type === 'click') {
      const el = await waitForElement(step.selector);
      if (!el) { console.warn('[Playbook] element not found:', step.selector); continue; }
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
      await sleep(120);
      continue;
    }
    if (step.type === 'input') {
      const el = await waitForElement(step.selector);
      if (!el) { console.warn('[Playbook] element not found:', step.selector); continue; }
      el.focus();
      for (const char of step.value) {
        el.dispatchEvent(new KeyboardEvent('keydown',  { key: char, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
        // For contenteditable divs (WhatsApp message box)
        if (el.isContentEditable) {
          document.execCommand('insertText', false, char);
        } else {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, el.value + char);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(40);
      }
      continue;
    }
    if (step.type === 'key') {
      const active = document.activeElement || document.body;
      const opts = { key: step.key, bubbles: true, cancelable: true };
      active.dispatchEvent(new KeyboardEvent('keydown',  opts));
      active.dispatchEvent(new KeyboardEvent('keypress', opts));
      active.dispatchEvent(new KeyboardEvent('keyup',    opts));
      if (step.key === 'Enter' && active.isContentEditable) {
        document.execCommand('insertParagraph', false);
      }
      await sleep(80);
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'PLAY_STEPS') {
    playSteps(msg.steps).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
