# Plan — WhatsApp Web Playbook Scheduler (Chrome Extension)

**Mode:** Record live actions · One-time date/time trigger · MV3

## Architecture
- `manifest.json` — MV3, host permission for `web.whatsapp.com`, `alarms` + `storage` permissions.
- `popup.html` / `popup.js` — UI: Record/Stop, name playbook, pick date/time, list saved playbooks, Schedule/Cancel.
- `recorder.js` (content script) — captures clicks & keystrokes on WhatsApp Web → ordered step list.
- `player.js` (content script) — replays an ordered step list against the DOM.
- `background.js` (service worker) — `chrome.alarms` schedules one-time fire; on fire, injects/triggers player.
- `storage.js` — thin wrapper over `chrome.storage.local` for playbooks + schedules.

## Step Model (recorded)
Each step = `{ type: "click"|"input"|"key"|"wait", selector, value, delay }`
- `click` → CSS/text selector of target
- `input` → typed text into focused field
- `wait` → ms gap (auto-captured between actions)

## Micro-steps (build order)
- [ ] 1. Scaffold `manifest.json` (MV3, permissions, content scripts, action popup).
- [ ] 2. Build `popup.html` static UI (record btn, playbook name, datetime input, list, schedule btn).
- [ ] 3. `storage.js` — save/load/delete playbooks + schedules.
- [ ] 4. `recorder.js` — capture clicks + keystrokes into step model; toggle via message from popup.
- [ ] 5. `popup.js` — wire Record/Stop, save recorded playbook to storage, render list.
- [ ] 6. `player.js` — replay step model with delays + element-wait.
- [ ] 7. `background.js` — set `chrome.alarms` for one-time time; on alarm, run player on the WhatsApp tab.
- [ ] 8. `popup.js` — wire datetime + Schedule/Cancel to background alarms.
- [ ] 9. Manual test pass on web.whatsapp.com; icons + README.

## Open risks (flag, not blocking)
- WhatsApp DOM is obfuscated/dynamic → recorder needs robust selectors (nth-child / aria fallbacks).
- Tab must be open & logged in at fire time for replay to work.
