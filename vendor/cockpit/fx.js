/* COCKPIT fx — atmosphere + motion helpers (D-011).
   Purely presentational: never reads or writes app data.
   Load with <script src=".../fx.js" defer></script>.

   Features
   - Background layer (grid, matrix rain, vignette, scanlines, noise, scanner)
   - Matrix rain: 30 fps cap, pauses when tab hidden, off under
     prefers-reduced-motion and in low-effects mode
   - Low-effects mode: <html data-fx="low">, persisted in localStorage,
     toggled by any [data-fx-toggle] button
   - Press glitch on buttons, count-up for [data-count], typewriter for
     .terminal[data-type], per-panel scan height for the boot sequence
*/
(() => {
  'use strict';

  const root = document.documentElement;
  const FX_KEY = 'cockpit.fx';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const RAIN_DELAY = 1200; // let the first screen paint before the rain starts

  /* ---------- effects mode ---------- */
  function storedMode() {
    try { return localStorage.getItem(FX_KEY); } catch { return null; }
  }
  function defaultMode() {
    const saveData = navigator.connection && navigator.connection.saveData;
    return saveData ? 'low' : 'full';
  }
  function setMode(mode, persist) {
    root.dataset.fx = mode;
    if (persist) { try { localStorage.setItem(FX_KEY, mode); } catch { /* private mode */ } }
    for (const btn of document.querySelectorAll('[data-fx-toggle]')) {
      btn.setAttribute('aria-pressed', String(mode === 'low'));
      const label = btn.querySelector('[data-fx-label]') || btn;
      label.textContent = mode === 'low' ? (btn.dataset.labelLow || 'Effects: low') : (btn.dataset.labelFull || 'Effects: full');
    }
    rain.sync();
  }
  // apply early to avoid a flash of heavy effects
  root.dataset.fx = storedMode() || defaultMode();

  /* ---------- background layer ---------- */
  function mountBackground() {
    if (document.querySelector('.cockpit-bg')) return document.querySelector('.cockpit-bg__rain');
    const bg = document.createElement('div');
    bg.className = 'cockpit-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML =
      '<canvas class="cockpit-bg__rain"></canvas>' +
      '<div class="cockpit-bg__flat"></div>' +
      '<div class="cockpit-bg__grid"></div>' +
      '<div class="cockpit-bg__vignette"></div>' +
      '<div class="cockpit-bg__scanner"></div>' +
      '<div class="cockpit-bg__scanlines"></div>' +
      '<div class="cockpit-bg__noise"></div>';
    document.body.prepend(bg);
    return bg.querySelector('canvas');
  }

  /* ---------- matrix rain ---------- */
  const rain = (() => {
    let canvas, ctx, columns = [], raf = 0, last = 0, color = '', voidColor = '', ready = false;
    const FRAME = 1000 / 30;
    const GLYPHS = '01アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF';

    function shouldRun() {
      // also paused while a modal is open (its blurred backdrop would repaint every frame)
      return canvas && ready && !document.hidden && !reduced.matches && root.dataset.fx !== 'low' && !document.body.classList.contains('has-modal');
    }
    function resize() {
      if (!canvas) return;
      // half resolution, scaled up by CSS: rain is a soft low-opacity texture (and the
      // upscale gives the "partly blurred" depth for free) — 4x fewer pixels to fill
      canvas.width = Math.ceil(innerWidth / 2);
      canvas.height = Math.ceil(innerHeight / 2);
      const step = 9;
      const count = Math.ceil(canvas.width / step);
      columns = Array.from({ length: count }, (_, i) => ({
        x: i * step,
        y: Math.random() * -canvas.height,
        speed: 2 + Math.random() * 5,
        size: Math.random() < 0.35 ? 5 : 7,       // small = far layer (half-res px)
        alpha: Math.random() < 0.35 ? 0.35 : 0.8,
      }));
      ctx.fillStyle = voidColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < FRAME) return;
      last = t;
      // trail fade: draw translucent void over previous frame
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = voidColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      for (const c of columns) {
        ctx.globalAlpha = c.alpha;
        ctx.font = `${c.size}px "JetBrains Mono", monospace`;
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c.x, c.y);
        c.y += c.speed * (c.size / 7) * 1.5;
        if (c.y > canvas.height + 20 && Math.random() > 0.975) c.y = Math.random() * -100;
      }
      ctx.globalAlpha = 1;
    }
    function start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    return {
      init(el) {
        canvas = el;
        ctx = canvas.getContext('2d', { alpha: false });
        const css = getComputedStyle(root);
        color = css.getPropertyValue('--matrix').trim();
        voidColor = css.getPropertyValue('--void').trim();
        resize();
        let pending;
        addEventListener('resize', () => { clearTimeout(pending); pending = setTimeout(resize, 150); });
        document.addEventListener('visibilitychange', () => this.sync());
        reduced.addEventListener('change', () => this.sync());
        new MutationObserver(() => this.sync()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        setTimeout(() => { ready = true; this.sync(); }, RAIN_DELAY);
      },
      sync() { if (!canvas) return; shouldRun() ? start() : stop(); },
    };
  })();

  /* ---------- press glitch ---------- */
  function wireGlitch() {
    document.addEventListener('pointerdown', (e) => {
      if (reduced.matches) return;
      const btn = e.target.closest('.btn, button');
      if (!btn || btn.disabled) return;
      btn.classList.remove('is-glitching');
      void btn.offsetWidth;
      btn.classList.add('is-glitching');
      setTimeout(() => btn.classList.remove('is-glitching'), 120);
    });
  }

  /* ---------- count-up ---------- */
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    if (Number.isNaN(target)) return;
    const decimals = (el.dataset.count.split('.')[1] || '').length;
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const fmt = (v) => prefix + v.toFixed(decimals) + suffix;
    if (reduced.matches) { el.textContent = fmt(target); return; }
    const dur = 700, t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- typewriter for terminal blocks ---------- */
  function typeOut(block) {
    if (reduced.matches) return;
    const nodes = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push({ node: walker.currentNode, text: walker.currentNode.textContent });
    nodes.forEach((n) => { n.node.textContent = ''; });
    block.setAttribute('aria-busy', 'true');
    let i = 0, pos = 0;
    const speed = Number(block.dataset.type) || 6; // chars per frame tick
    const step = () => {
      for (let k = 0; k < speed && i < nodes.length; k++) {
        const n = nodes[i];
        pos++;
        n.node.textContent = n.text.slice(0, pos);
        if (pos >= n.text.length) { i++; pos = 0; }
      }
      if (i < nodes.length) setTimeout(step, 16);
      else block.removeAttribute('aria-busy');
    };
    step();
  }

  /* ---------- boot sequence helpers ---------- */
  function prepBoot() {
    document.querySelectorAll('.boot').forEach((group) => {
      [...group.children].forEach((child, i) => {
        if (!child.style.getPropertyValue('--i')) child.style.setProperty('--i', i);
        if (child.classList.contains('panel')) child.style.setProperty('--scan-h', `${child.offsetHeight}px`);
      });
    });
  }

  /* Performance watchdog: if frames are slow in the first seconds and the user has not
     chosen a mode, switch to low effects automatically (and say so via a DOM event). */
  function watchdog() {
    if (storedMode() || root.dataset.fx === 'low' || reduced.matches) return;
    const lower = () => {
      if (root.dataset.fx === 'low') return;
      setMode('low', false);
      document.dispatchEvent(new CustomEvent('cockpit:auto-low'));
    };
    // Chrome: long main-thread tasks while the rain runs
    let busy = 0;
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) busy += e.duration;
        if (busy > 500) { po.disconnect(); lower(); }
      });
      po.observe({ type: 'longtask' });
      setTimeout(() => po.disconnect(), 6000);
    } catch { /* Safari: no longtask API — frame sampling below */ }
    // Everywhere: sample frame times for 2.5 s once the rain is running
    let frames = 0, slow = 0, last = 0, start = 0;
    const step = (t) => {
      if (!start) { start = last = t; return requestAnimationFrame(step); }
      const dt = t - last; last = t; frames++;
      if (dt > 50) slow++;
      if (t - start < 2500) return requestAnimationFrame(step);
      if (frames > 0 && slow / frames > 0.25) lower();
    };
    setTimeout(() => requestAnimationFrame(step), RAIN_DELAY + 300);
  }

  function init() {
    rain.init(mountBackground());
    setMode(root.dataset.fx, false);
    watchdog();
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-fx-toggle]')) return;
      setMode(root.dataset.fx === 'low' ? 'full' : 'low', true);
    });
    wireGlitch();
    prepBoot();
    document.querySelectorAll('[data-count]').forEach(countUp);
    document.querySelectorAll('.terminal[data-type]').forEach(typeOut);
  }

  window.cockpitFx = { setMode: (m) => setMode(m, true), countUp, typeOut };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
