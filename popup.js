/// <reference types="chrome"/>

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs[0] || null;
}

async function sendToContent(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg);
}

// ── Storage helpers (inline, storage.js not importable in popup directly) ──
const PLAYBOOKS_KEY = 'playbooks';
async function getPlaybooks() {
  const r = await chrome.storage.local.get(PLAYBOOKS_KEY);
  return r[PLAYBOOKS_KEY] || {};
}
async function savePlaybook(name, steps) {
  const p = await getPlaybooks();
  p[name] = { steps, createdAt: Date.now(), schedule: null };
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: p });
}
async function deletePlaybook(name) {
  const p = await getPlaybooks();
  delete p[name];
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: p });
}
async function setSchedule(name, timestamp) {
  const p = await getPlaybooks();
  if (!p[name]) return;
  p[name].schedule = timestamp;
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: p });
}
async function clearSchedule(name) { await setSchedule(name, null); }

// ── UI refs ──
const btnRecord    = document.getElementById('btnRecord');
const btnStop      = document.getElementById('btnStop');
const recordBadge  = document.getElementById('recordBadge');
const stepCount    = document.getElementById('stepCount');
const nameInput    = document.getElementById('playbookName');
const listEl       = document.getElementById('playbookList');
const emptyState   = document.getElementById('emptyState');
const selectEl     = document.getElementById('playbookSelect');
const timeInput    = document.getElementById('scheduleTime');
const btnSchedule  = document.getElementById('btnSchedule');

let isRecording = false;

// ── Recording ──
// Record button: fires START_RECORDING then closes popup so user can interact with WhatsApp.
// The floating overlay injected by recorder.js handles Stop & Save independently.
btnRecord.addEventListener('click', async () => {
  const tab = await getWhatsAppTab();
  if (!tab) { alert('Open WhatsApp Web first.'); return; }
  const name = nameInput.value.trim() || `Playbook ${new Date().toLocaleString()}`;
  try {
    await sendToContent(tab.id, { action: 'START_RECORDING', name });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['recorder.js'] });
    await sendToContent(tab.id, { action: 'START_RECORDING', name });
  }
  // Close popup — overlay on WhatsApp page takes over
  window.close();
});

// Stop button kept for cases where popup is reopened mid-recording
btnStop.addEventListener('click', async () => {
  const tab = await getWhatsAppTab();
  if (!tab) return;
  const resp = await sendToContent(tab.id, { action: 'STOP_RECORDING' });
  isRecording = false;
  btnStop.style.display   = 'none';
  btnRecord.style.display = 'block';
  recordBadge.className   = 'status-badge badge-idle';
  recordBadge.textContent = 'Idle';

  const steps = resp?.steps || [];
  stepCount.textContent = `${steps.length} steps recorded`;
  if (!steps.length) { alert('No steps recorded.'); return; }
  let name = nameInput.value.trim() || `Playbook ${new Date().toLocaleString()}`;
  await savePlaybook(name, steps);
  nameInput.value = '';
  await renderList();
});

// ── Scheduling ──
btnSchedule.addEventListener('click', async () => {
  const name = selectEl.value;
  const timeVal = timeInput.value;
  if (!name) { alert('Select a playbook.'); return; }
  if (!timeVal) { alert('Pick a date and time.'); return; }
  const ts = new Date(timeVal).getTime();
  if (ts <= Date.now()) { alert('Time must be in the future.'); return; }

  await setSchedule(name, ts);
  const alarmName = `playbook::${name}`;
  chrome.alarms.create(alarmName, { when: ts });
  await renderList();
  alert(`Scheduled "${name}" for ${new Date(ts).toLocaleString()}`);
});

// ── List render ──
async function renderList() {
  const playbooks = await getPlaybooks();
  const names = Object.keys(playbooks);

  // rebuild select
  selectEl.innerHTML = '<option value="">— select a playbook —</option>';
  names.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    selectEl.appendChild(opt);
  });

  // rebuild list
  listEl.innerHTML = '';
  if (!names.length) {
    listEl.innerHTML = '<li id="emptyState" class="playbook-item"><span>No playbooks yet.</span></li>';
    return;
  }

  for (const name of names) {
    const pb = playbooks[name];
    const li = document.createElement('li');
    li.className = 'playbook-item';

    const info = document.createElement('div');
    info.style.flex = '1';
    info.style.overflow = 'hidden';
    const nameSpan = document.createElement('div');
    nameSpan.className = 'playbook-name';
    nameSpan.textContent = name;
    const meta = document.createElement('div');
    meta.className = 'playbook-meta';
    const stepLabel = `${pb.steps.length} steps`;
    const schedLabel = pb.schedule
      ? `⏰ ${new Date(pb.schedule).toLocaleString()}`
      : 'Not scheduled';
    meta.textContent = `${stepLabel} · ${schedLabel}`;
    if (pb.schedule) {
      const badge = document.createElement('span');
      badge.className = 'status-badge badge-scheduled';
      badge.textContent = 'Scheduled';
      nameSpan.appendChild(badge);
    }
    info.appendChild(nameSpan);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn-run';
    runBtn.textContent = '▶ Run';
    runBtn.addEventListener('click', () => runPlaybook(name, pb.steps));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async () => {
      chrome.alarms.clear(`playbook::${name}`);
      await deletePlaybook(name);
      await renderList();
    });

    if (pb.schedule) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-danger';
      cancelBtn.textContent = '✕ Cancel';
      cancelBtn.addEventListener('click', async () => {
        chrome.alarms.clear(`playbook::${name}`);
        await clearSchedule(name);
        await renderList();
      });
      actions.appendChild(cancelBtn);
    }

    actions.appendChild(runBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

async function runPlaybook(name, steps) {
  const tab = await getWhatsAppTab();
  if (!tab) { alert('Open WhatsApp Web first.'); return; }
  await chrome.runtime.sendMessage({ action: 'RUN_PLAYBOOK', tabId: tab.id, steps });
}

renderList();
