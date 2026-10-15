// LifeOS app shell: status bar, quick capture, navigation, router.
import * as M from './model.js';
import { store, init, commit, onChange, ofType } from './store.js';
import { h, icon, toast } from './ui.js';
import * as V from './views.js';
import { dataView } from './data.js';
import { openDetails } from './actions.js';

const ROUTES = {
  today: { label: 'Today', icon: 'today', view: V.todayView, primary: true, rain: 'calm' },
  inbox: { label: 'Inbox', icon: 'inbox', view: V.inboxView, primary: true },
  tasks: { label: 'Tasks', icon: 'tasks', view: V.tasksView, primary: true },
  promises: { label: 'Promises', icon: 'promise', view: V.promisesView, primary: true },
  calendar: { label: 'Appointments', icon: 'calendar', view: V.calendarView },
  routines: { label: 'Routines', icon: 'routine', view: V.routinesView },
  ideas: { label: 'Ideas & projects', icon: 'idea', view: V.ideasView },
  checkin: { label: 'Check-ins', icon: 'checkin', view: V.checkinsView },
  'checkin/morning': { label: 'Morning check-in', icon: 'checkin', view: V.morningView, parent: 'checkin', rain: 'quiet' },
  'checkin/evening': { label: 'Evening check-in', icon: 'checkin', view: V.eveningView, parent: 'checkin', rain: 'quiet' },
  search: { label: 'Search', icon: 'search', view: V.searchView, rain: 'quiet' },
  data: { label: 'Data & backup', icon: 'data', view: dataView, rain: 'quiet' },
};
const NAV = ['today', 'inbox', 'tasks', 'promises', 'calendar', 'routines', 'ideas', 'checkin', 'search', 'data'];

const els = {};
let current = null;

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return { name: ROUTES[path] ? path : 'today', open: new URLSearchParams(query ?? '').get('open') };
}

/* ---------- shell ---------- */
function buildShell() {
  const root = document.getElementById('app');
  els.screen = h('span', { class: 'statusbar__screen' }, 'Today');
  els.net = h('span', { class: 'led', id: 'net', role: 'status' });
  els.clock = h('span', { class: 'statusbar__clock t-num' });
  els.inboxLed = h('a', { class: 'led statusbar__inbox', href: '#/inbox' });
  const status = h('header', { class: 'statusbar shell-status' },
    h('a', { class: 'statusbar__brand', href: '#/today' }, 'LifeOS ', h('span', {}, '//'), ' ', els.screen),
    h('span', { class: 'statusbar__leds' }, els.net, els.inboxLed),
    els.clock,
    h('button', { class: 'btn btn--ghost btn--sm statusbar__fx', type: 'button', 'data-fx-toggle': '', 'aria-pressed': 'false' }, 'Effects: full'));

  els.capInput = h('input', { id: 'capture', type: 'text', autocomplete: 'off', enterkeyhint: 'done', maxlength: '2000', placeholder: 'Capture anything — sort it out later', 'aria-label': 'Quick capture to inbox', disabled: true });
  els.capBtn = h('button', { class: 'btn btn--primary', type: 'submit', disabled: true }, 'Capture');
  els.capMsg = h('p', { class: 'hud-msg capture__msg', 'aria-live': 'polite' });
  const capture = h('form', { class: 'capture', role: 'search', 'aria-label': 'Quick capture', onsubmit: onCapture },
    h('div', { class: 'field', 'data-prefix': '>' }, els.capInput), els.capBtn);

  const links = NAV.map((k) => h('a', { class: `nav__link${ROUTES[k].primary ? ' is-primary' : ''}`, href: `#/${k}`, 'data-route': k }, icon(ROUTES[k].icon), h('span', {}, ROUTES[k].label), k === 'inbox' ? h('span', { class: 'nav__badge t-num', 'data-badge': 'inbox' }) : null));
  els.more = h('button', { class: 'nav__link nav__more', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'nav', onclick: toggleMore }, icon('more'), h('span', {}, 'More'));
  els.nav = h('nav', { class: 'appnav', id: 'nav', 'aria-label': 'Main' }, h('div', { class: 'appnav__links' }, links), els.more);

  els.main = h('main', { id: 'main', class: 'shell-main', tabindex: '-1' });
  root.replaceChildren(
    h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); els.main.focus(); } }, 'Skip to content'),
    h('div', { class: 'shell cockpit-frame' }, status, capture, els.capMsg, els.nav, els.main),
    h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' }));
}
function toggleMore(force) {
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('nav-open');
  document.body.classList.toggle('nav-open', open);
  els.more.setAttribute('aria-expanded', String(open));
}

let capturing = false;
let lastCap = { text: '', at: 0 };
async function onCapture(e) {
  e.preventDefault();
  if (capturing) return;
  const text = els.capInput.value;
  // accidental double-submit of the same text within 2s is ignored
  if (text.trim() && text.trim() === lastCap.text && Date.now() - lastCap.at < 2000) return;
  capturing = true; els.capBtn.disabled = true;
  els.capMsg.removeAttribute('data-state');
  try {
    const item = M.createInbox(text);
    await commit(item);
    lastCap = { text: text.trim(), at: Date.now() };
    els.capInput.value = '';
    els.capMsg.textContent = `Saved to inbox ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    els.capMsg.dataset.state = 'crit';
    els.capMsg.textContent = err.message || 'Not saved — local storage failed.';
  } finally {
    capturing = false; els.capBtn.disabled = false; els.capInput.focus();
    clearTimeout(onCapture.t); onCapture.t = setTimeout(() => { els.capMsg.textContent = ''; }, 5000);
  }
}

function updateChrome() {
  const online = navigator.onLine;
  els.net.dataset.state = online ? 'online' : 'offline';
  els.net.textContent = online ? 'Online' : 'Offline · all works';
  const n = ofType('inbox').filter((i) => i.status === 'unprocessed').length;
  els.inboxLed.dataset.state = n ? 'warn' : 'ok';
  els.inboxLed.textContent = `Inbox ${n}`;
  for (const b of document.querySelectorAll('[data-badge="inbox"]')) b.textContent = n ? String(n) : '';
  tick();
}
function tick() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  els.clock.textContent = `${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} ${tz.split('/').pop().replace(/_/g, ' ')}`;
  els.clock.title = tz;
}

/* ---------- rendering ---------- */
function render({ routeChange } = {}) {
  const r = route();
  const def = ROUTES[r.name];
  const scroll = window.scrollY;
  let node;
  try { node = def.view(); }
  catch (e) { console.error(e); node = h('section', { class: 'panel', 'data-tone': 'amber' }, h('h2', {}, 'This screen hit a problem'), h('p', { class: 'hud-msg', 'data-state': 'crit' }, e.message), h('p', { class: 't-body' }, 'Your data is safe. Try another screen or reload.')); }
  if (!routeChange) node.classList.remove('boot');
  els.main.replaceChildren(node);
  if (routeChange) {
    els.main.classList.remove('screen-enter'); void els.main.offsetWidth; els.main.classList.add('screen-enter');
    window.scrollTo(0, 0);
    document.title = `${def.label} · LifeOS`;
    els.screen.textContent = def.label;
    document.body.dataset.rain = def.rain ?? 'default';
    for (const a of els.nav.querySelectorAll('[data-route]')) {
      const on = a.dataset.route === r.name || a.dataset.route === def.parent;
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    }
    toggleMore(false);
    // run the cockpit boot helpers for the new screen
    window.cockpitFx && node.querySelectorAll('[data-count]').forEach((x) => window.cockpitFx.countUp(x));
    if (store.firstPaint && window.cockpitFx) node.querySelectorAll('.terminal[data-type]').forEach((x) => window.cockpitFx.typeOut(x));
    for (const p of node.querySelectorAll('.boot > .panel')) p.style.setProperty('--scan-h', `${p.offsetHeight}px`);
    [...node.children].forEach((c, i) => c.style.setProperty('--i', i));
    if (r.open) setTimeout(() => openDetails(r.open), 50);
  } else window.scrollTo(0, scroll);
  store.firstPaint = false;
  updateChrome();
}

/* ---------- keyboard ---------- */
function onKey(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (typing || document.body.classList.contains('has-modal')) return;
  if (e.key === 'c' || e.key === 'n') { e.preventDefault(); els.capInput.focus(); }
  if (e.key === '/') { e.preventDefault(); location.hash = '#/search'; }
}

async function start() {
  buildShell();
  store.firstPaint = true;
  els.main.append(h('p', { class: 'boot-msg t-label' }, '>> SYSTEM  opening local storage…'));
  try {
    await init();
  } catch (e) {
    els.main.replaceChildren(h('section', { class: 'panel', 'data-tone': 'amber' },
      h('h2', {}, 'Local storage is unavailable'),
      h('p', { class: 't-body' }, `${e.message || e}. LifeOS keeps everything on this device and needs the browser's local database.`),
      h('p', { class: 't-body' }, 'On iPhone, turn off Private Browsing. In Chrome, allow site data for this site.')));
    return;
  }
  els.capInput.disabled = false; els.capBtn.disabled = false;
  onChange((reason) => render({ routeChange: false, reason }));
  addEventListener('hashchange', () => render({ routeChange: true }));
  addEventListener('online', updateChrome);
  addEventListener('offline', updateChrome);
  addEventListener('keydown', onKey);
  document.addEventListener('cockpit:auto-low', () => toast('Effects lowered so the app stays smooth on this device. Change it under Data & backup.', { ms: 6000 }));
  setInterval(tick, 30_000);
  V.setRerender(() => render({ routeChange: false }));
  render({ routeChange: true });
  if (!location.hash) history.replaceState(null, '', '#/today');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('An update is ready — reload to use it.', { ms: 8000 }); });
      });
    }).catch(() => { /* offline shell unavailable; app still works online */ });
  }
}

start();
