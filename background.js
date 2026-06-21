const PLAYBOOKS_KEY = 'playbooks';

async function getPlaybooks() {
  const r = await chrome.storage.local.get(PLAYBOOKS_KEY);
  return r[PLAYBOOKS_KEY] || {};
}
async function clearSchedule(name) {
  const p = await getPlaybooks();
  if (!p[name]) return;
  p[name].schedule = null;
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: p });
}

async function runPlaybookOnTab(tabId, steps) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['player.js'] });
  } catch { /* already injected */ }
  await chrome.tabs.sendMessage(tabId, { action: 'PLAY_STEPS', steps });
}

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs[0] || null;
}

// Alarm fires → run the matching playbook
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('playbook::')) return;
  const name = alarm.name.slice('playbook::'.length);
  const playbooks = await getPlaybooks();
  const pb = playbooks[name];
  if (!pb) return;

  const tab = await getWhatsAppTab();
  if (!tab) {
    console.warn('[Playbook] WhatsApp Web tab not found at alarm time.');
    return;
  }
  await runPlaybookOnTab(tab.id, pb.steps);
  await clearSchedule(name);
});

// Message from popup: run immediately
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'RUN_PLAYBOOK') {
    runPlaybookOnTab(msg.tabId, msg.steps)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
