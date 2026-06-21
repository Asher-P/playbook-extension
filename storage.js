const PLAYBOOKS_KEY = 'playbooks';

async function getPlaybooks() {
  const result = await chrome.storage.local.get(PLAYBOOKS_KEY);
  return result[PLAYBOOKS_KEY] || {};
}

async function savePlaybook(name, steps) {
  const playbooks = await getPlaybooks();
  playbooks[name] = { steps, createdAt: Date.now(), schedule: null };
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: playbooks });
}

async function deletePlaybook(name) {
  const playbooks = await getPlaybooks();
  delete playbooks[name];
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: playbooks });
}

async function setSchedule(name, timestamp) {
  const playbooks = await getPlaybooks();
  if (!playbooks[name]) return;
  playbooks[name].schedule = timestamp;
  await chrome.storage.local.set({ [PLAYBOOKS_KEY]: playbooks });
}

async function clearSchedule(name) {
  await setSchedule(name, null);
}
