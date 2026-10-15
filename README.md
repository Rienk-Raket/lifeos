# LifeOS — working prototype (D-012)

A private, offline-first daily cockpit for **Windows 11 + Chrome** and **iPhone + Safari**. All data stays on the device (IndexedDB). No accounts, no server, no tracking.

## What you can do
| Screen | What it does |
|---|---|
| **Quick capture** (top of every screen, key `c`) | Type anything, press Enter → saved to the inbox, confirmed with a timestamp. Works offline. |
| **Today** | Fixed appointments (with leave-by time), your 3 priorities, promises due, due/overdue tasks, routines due, system readout (backup / storage / network status). |
| **Inbox** | Clarify each capture into a task, promise, appointment, routine or idea — or mark it processed. The original text is kept. |
| **Tasks** | Create, complete, reopen, reschedule, remove date, cancel (with reason), archive, restore, delete. After 3 postponements a neutral “postponed 3×” note offers: keep, remove date, clarify, let go. |
| **Promises** | Commitments to a person, kept separate from tasks. “Fulfilled”, not “done”. Moving *your* target date never changes the promised date; a new promised date is only recorded after you confirm the other person agreed. |
| **Appointments** | Local entries (not Google Calendar). Leave-by = arrive − travel − buffer, shown only when you entered a travel time. |
| **Routines** | Every N days / weekly on chosen days / monthly on a day. Only the current due date appears; done, skip, move (that time only), pause/resume (no backfill), edit (applies from tomorrow). |
| **Ideas & projects** | Turn an idea into a project with outcome, reason, area, review date and one first next action. Projects without an open next action are flagged. |
| **Check-ins** | Morning: see the day, pick up to 3 priorities, optional intention. Evening: done list, an explicit choice for every open item, capture, tomorrow's key outcome. Drafts survive interruption. |
| **Search** (key `/`) | Everything, including finished and archived items. Offline. |
| **Data & backup** | Encrypted backup (AES-256-GCM, passphrase via PBKDF2-SHA-256 310k; verified by decrypting before you save it), readable JSON export, restore with preview → replace → read-back verification → automatic rollback on mismatch, erase all, storage persistence, install steps, effects toggle. |

## Run locally
```bash
cd life-dashboard/app
python3 -m http.server 8080      # then open http://localhost:8080
npm test                          # 14 domain + crypto tests (Node ≥ 20)
```
`localhost` counts as secure, so offline mode and encryption work there.

## Live
**https://rienk-raket.github.io/lifeos/** — repo `Rienk-Raket/lifeos` (public; code only, never your data). Redeploy after changes: `sh scripts/deploy-pages.sh "what changed"` (runs the tests first).

## Put it on an iPhone
iPhone Safari only enables offline mode and encryption on **https**. Host the `app/` folder on any static https host (GitHub Pages, Netlify, Cloudflare Pages, your own server). Then in Safari: Share → **Add to Home Screen**, and open LifeOS from the icon. Installed apps keep their data far more reliably on iOS; still make regular encrypted backups (Data & backup → Share → Save to Files).

> Data is tied to the web address. Moving the app to a different URL starts with empty data — use backup/restore to move it.

## Architecture
- Plain ES modules, no build step, no dependencies. `src/model.js` (pure domain rules, tested), `src/db.js` (IndexedDB), `src/store.js` (memory + write-through, atomic multi-record commits, day rollover, restore with rollback), `src/backup.js` (WebCrypto), `src/ui.js`, `src/actions.js`, `src/views.js`, `src/data.js`, `src/app.js` (shell + hash router).
- Every record has a stable id and an append-only `history` of lifecycle events.
- `sw.js`: precaches everything; stale-while-revalidate, so new versions load on the next launch.
- Style: `vendor/cockpit/` is synced from `design/cockpit/` (`sh design/cockpit/sync-to-spike.sh app`). App layout is `app.css` (tokens only).

## Known limits (prototype)
- No Google Calendar / Todoist connection yet (ODR-005 open). Appointments are local.
- Single device; no sync. Moving data = backup → restore.
- No notifications.
- Tested in Chromium (desktop + iPhone-sized emulation); not yet on a physical iPhone.
