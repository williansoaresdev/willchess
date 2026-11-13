import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { t, setLang, getLang, detectLang, LANGS } from './i18n.js';
import { getSetting, setSetting, getStats, getGames } from './db.js';
import { play, setSoundOn, isSoundOn, unlockAudio } from './sound.js';
import { Engine } from './engine.js';
import { createGame, LEVELS } from './game.js';
import { h, esc, modal, KNIGHT_SVG } from './ui.js';

// Auto-update: the new service worker activates immediately and the page reloads once.
// Updates are checked on launch, every hour and whenever the app returns to the foreground.
let swReg = null;
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    swReg = reg;
    if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  },
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') swReg?.update().catch(() => {});
});
let reloading = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloading || current === 'game') return; // never interrupt a game; next launch uses the new version
  reloading = true;
  location.reload();
});

// ---- wooden board texture (SVG data URI) ----
(function setupBoard() {
  const light = '#ecd0a0';
  const dark = '#a9703b';
  let r = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${dark}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${light}"/>${r}</svg>`;
  document.documentElement.style.setProperty('--board-img', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
})();

const app = document.getElementById('app');
app.innerHTML = `<header class="topbar" hidden></header><main class="stage" id="stage"></main>`;
const topbar = app.querySelector('.topbar');
const stage = document.getElementById('stage');

let engine = null;
let engineFailed = false;
function getEngine() {
  if (!engine && !engineFailed) {
    try {
      engine = new Engine();
    } catch (e) {
      console.error(e);
      engineFailed = true;
    }
  }
  return engine;
}

// ---- install prompt (Windows / Android) ----
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  renderTopbar();
  if (current === 'levels') reload();
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  renderTopbar();
  if (current === 'levels') reload();
});
async function doInstall() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;
  renderTopbar();
  if (current === 'levels') reload();
}

// ---- topbar ----
function renderTopbar() {
  const inGame = current === 'game';
  topbar.hidden = current === 'splash';
  topbar.innerHTML = `
    <button class="brand" data-go="levels" aria-label="WillChess"><span class="brand-ico">${KNIGHT_SVG}</span><span>WillChess</span></button>
    <div class="top-actions">
      ${deferredInstall && !isStandalone() ? `<button class="icon-btn" data-act="install" title="${esc(t('install'))}" aria-label="${esc(t('install'))}">⤓</button>` : ''}
      ${inGame ? '' : `<button class="icon-btn txt" data-act="lang" title="${esc(t('language'))}" aria-label="${esc(t('language'))}">${getLang().toUpperCase()}</button>`}
      <button class="icon-btn" data-act="sound" title="${esc(t('sound'))}" aria-label="${esc(t('sound'))}">${isSoundOn() ? '🔊' : '🔇'}</button>
      <button class="icon-btn ${current === 'stats' ? 'active' : ''}" data-act="stats" title="${esc(t('statsTitle'))}" aria-label="${esc(t('statsTitle'))}">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="17" y="8" width="4" height="13" rx="1"/></svg>
      </button>
    </div>`;
  topbar.querySelector('[data-go]').onclick = async () => {
    if (current === 'game') return; // use the in-game leave button
    if (current !== 'levels') go('levels');
  };
  topbar.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async () => {
      unlockAudio();
      const a = b.dataset.act;
      if (a === 'install') doInstall();
      else if (a === 'sound') {
        setSoundOn(!isSoundOn());
        setSetting('sound', isSoundOn());
        renderTopbar();
      } else if (a === 'lang') {
        const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
        setLang(next);
        await setSetting('lang', next);
        renderTopbar();
        reload();
      } else if (a === 'stats') {
        if (current === 'game') {
          // peek at stats without leaving? keep it simple: not available mid-game
          return;
        }
        go(current === 'stats' ? 'levels' : 'stats');
      }
    };
  });
  topbar.querySelector('[data-act=stats]').style.opacity = inGame ? '.35' : '';
}

// ---- router ----
let current = 'splash';
let currentParams = {};
let currentEl = null;
let activeGame = null;
const screens = { splash, levels, game: gameScreen, end: endScreen, stats };

function mount(name, params, anim) {
  const old = currentEl;
  if (activeGame) {
    activeGame.destroy();
    activeGame = null;
  }
  current = name;
  currentParams = params;
  const el = document.createElement('section');
  el.className = `screen ${anim ? 'enter-' + anim : ''}`;
  stage.appendChild(el);
  currentEl = el;
  renderTopbar();
  screens[name](el, params);
  if (old) {
    old.classList.add('leave-' + (anim || 'fade'));
    setTimeout(() => old.remove(), 450);
  }
}
function go(name, params = {}) {
  play('transition');
  const anim = name === 'stats' ? 'up' : name === 'levels' && current === 'splash' ? 'zoom' : 'right';
  mount(name, params, anim);
}
function reload() {
  const old = currentEl;
  if (current === 'game') return;
  mount(current, currentParams, '');
  old?.remove();
}

// ---- screens ----
function splash(el) {
  el.classList.add('splash');
  el.innerHTML = `
    <div class="splash-inner">
      <h1 class="splash-title">WillChess</h1>
      <p class="splash-sub">${esc(t('subtitle'))}</p>
      <div class="splash-knight">${KNIGHT_SVG}</div>
    </div>`;
  getEngine(); // warm up the engine during the splash
  setTimeout(() => {
    if (current === 'splash') go('levels');
  }, 2000);
}

const sel = { level: 'random', color: 'random' };

function levels(el) {
  const levelOpts = [{ v: 'random', label: t('random') }, ...LEVELS.map((l) => ({ v: l.id, label: t('levels')[l.id], sub: l.elo ? `~${l.elo}` : 'MAX' }))];
  const colorOpts = [
    { v: 'random', label: t('random'), ico: '🎲' },
    { v: 'white', label: t('white'), ico: '♔' },
    { v: 'black', label: t('black'), ico: '♚' },
  ];
  const showInstall = deferredInstall && !isStandalone();
  const platform = /Android/i.test(navigator.userAgent) ? 'installAndroid' : /Windows/i.test(navigator.userAgent) ? 'installWindows' : 'installGeneric';
  el.innerHTML = `
    <div class="page levels">
      ${
        showInstall
          ? `<div class="install-card"><div><b>${esc(t('installTitle'))}</b><p>${esc(t(platform))}</p></div>
             <div class="install-actions"><button class="btn small primary" data-install>${esc(t('install'))}</button><button class="btn small ghost" data-dismiss>${esc(t('later'))}</button></div></div>`
          : ''
      }
      <h2>${esc(t('levelTitle'))}</h2>
      <div class="field"><label>${esc(t('engineLevel'))}</label>
        <div class="chips" data-group="level">${levelOpts
          .map((o) => `<button class="opt ${sel.level === o.v ? 'on' : ''}" data-v="${o.v}">${esc(o.label)}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`)
          .join('')}</div></div>
      <div class="field"><label>${esc(t('pieceColor'))}</label>
        <div class="chips three" data-group="color">${colorOpts
          .map((o) => `<button class="opt ${sel.color === o.v ? 'on' : ''}" data-v="${o.v}"><span class="big">${o.ico}</span>${esc(o.label)}</button>`)
          .join('')}</div></div>
      <button class="btn primary big-btn" data-start>${esc(t('start'))}</button>
    </div>`;
  el.querySelectorAll('[data-group]').forEach((g) => {
    g.querySelectorAll('.opt').forEach((b) => {
      b.onclick = () => {
        const v = b.dataset.v;
        sel[g.dataset.group] = g.dataset.group === 'level' && v !== 'random' ? Number(v) : v;
        g.querySelectorAll('.opt').forEach((x) => x.classList.toggle('on', x === b));
        play('move');
      };
    });
  });
  const inst = el.querySelector('[data-install]');
  if (inst) inst.onclick = doInstall;
  const dis = el.querySelector('[data-dismiss]');
  if (dis) dis.onclick = () => el.querySelector('.install-card').remove();
  el.querySelector('[data-start]').onclick = startTraining;
  getEngine();
}

async function startTraining() {
  unlockAudio();
  const skip = await getSetting('skipHow', false);
  if (!skip) {
    const box = h(`<div><h3>${esc(t('howTitle'))}</h3><p class="modal-text">${esc(t('howText'))}</p>
      <label class="check"><input type="checkbox" data-skip /><span>${esc(t('dontShow'))}</span></label>
      <div class="modal-actions"><button class="btn primary" data-ok>${esc(t('understood'))}</button></div></div>`);
    box.querySelector('[data-ok]').onclick = () => box.close(box.querySelector('[data-skip]').checked);
    const dontShow = await modal(box);
    if (dontShow) await setSetting('skipHow', true);
  }
  const level = sel.level === 'random' ? LEVELS[Math.floor(Math.random() * LEVELS.length)] : LEVELS[sel.level];
  const color = sel.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : sel.color;
  go('game', { level, color });
}

function gameScreen(el, { level, color }) {
  const eng = getEngine();
  if (!eng) {
    el.innerHTML = `<div class="page"><p>${esc(t('engineError'))}</p></div>`;
    return;
  }
  activeGame = createGame(el, {
    userColor: color,
    level,
    engine: eng,
    onEnd: (game) => go('end', { game }),
    onLeave: () => go('levels'),
  });
}

function endScreen(el, { game }) {
  const total = game.good + game.bad;
  const acc = total ? Math.round((game.good / total) * 100) : 100;
  const msg =
    game.result === 'win' ? t('resWin') : game.result === 'loss' ? t('resLoss') : { stalemate: t('drawStalemate'), repetition: t('drawRep'), material: t('drawMat'), fifty: t('drawFifty') }[game.reason] || t('resDraw');
  el.innerHTML = `
    <div class="page end">
      <div class="end-knight">${KNIGHT_SVG}</div>
      <h2 class="congrats">${esc(t('congrats'))}</h2>
      <p class="result ${game.result}">${esc(msg)}</p>
      <div class="summary">
        <h4>${esc(t('summary'))}</h4>
        <div class="stat-row"><div class="stat good"><b>${game.good}</b><span>${esc(t('good'))}</span></div>
        <div class="stat bad"><b>${game.bad}</b><span>${esc(t('bad'))}</span></div>
        <div class="stat"><b>${acc}%</b><span>${esc(t('accuracy'))}</span></div></div>
      </div>
      <button class="btn primary big-btn" data-new>${esc(t('newTraining'))}</button>
      <button class="btn ghost" data-stats>${esc(t('statsTitle'))}</button>
    </div>`;
  el.querySelector('[data-new]').onclick = () => go('levels');
  el.querySelector('[data-stats]').onclick = () => go('stats');
  setTimeout(() => play('finish'), 250);
  burst(el);
}

function burst(el) {
  const colors = ['#e8c99b', '#c68a4d', '#a9703b', '#fff', '#7a4a24'];
  const wrap = h('<div class="confetti" aria-hidden="true"></div>');
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.8 + 's';
    p.style.animationDuration = 2 + Math.random() * 2 + 's';
    wrap.appendChild(p);
  }
  el.appendChild(wrap);
  setTimeout(() => wrap.remove(), 5000);
}

async function stats(el) {
  el.innerHTML = `<div class="page"><h2>${esc(t('statsTitle'))}</h2><div data-body></div></div>`;
  const [st, games] = await Promise.all([getStats(), getGames()]);
  const body = el.querySelector('[data-body]');
  const tot = (s) => s.good + s.bad;
  const pct = (s) => (tot(s) ? Math.round((s.good / tot(s)) * 100) : 0);
  const all = { good: st.white.good + st.black.good, bad: st.white.bad + st.black.bad };
  if (!tot(all) && !games.length) {
    body.innerHTML = `<p class="empty">${esc(t('noData'))}</p>`;
    return;
  }
  const bar = (label, s) => `
    <div class="bar-card"><div class="bar-head"><b>${esc(label)}</b><span>${tot(s)} · ${esc(t('accuracy'))} ${pct(s)}%</span></div>
    <div class="bar"><i class="g" style="width:${tot(s) ? pct(s) : 0}%"></i><i class="b" style="width:${tot(s) ? 100 - pct(s) : 0}%"></i></div>
    <div class="bar-legend"><span class="good">✓ ${esc(t('good'))}: <b>${s.good}</b></span><span class="bad">✗ ${esc(t('bad'))}: <b>${s.bad}</b></span></div></div>`;
  const w = games.filter((g) => g.result === 'win').length;
  const l = games.filter((g) => g.result === 'loss').length;
  const d = games.filter((g) => g.result === 'draw').length;
  const fmt = new Intl.DateTimeFormat(getLang() === 'pt' ? 'pt-BR' : getLang(), { dateStyle: 'short', timeStyle: 'short' });
  const icon = { win: '🏆', loss: '✗', draw: '=' };
  body.innerHTML = `
    <h4>${esc(t('byColor'))}</h4>
    ${bar(t('total'), all)}${bar('♔ ' + t('white'), st.white)}${bar('♚ ' + t('black'), st.black)}
    <h4>${esc(t('games'))}</h4>
    <div class="stat-row"><div class="stat"><b>${games.length}</b><span>${esc(t('games'))}</span></div>
      <div class="stat good"><b>${w}</b><span>${esc(t('wins'))}</span></div>
      <div class="stat"><b>${d}</b><span>${esc(t('draws'))}</span></div>
      <div class="stat bad"><b>${l}</b><span>${esc(t('losses'))}</span></div></div>
    ${
      games.length
        ? `<h4>${esc(t('recent'))}</h4><ul class="recent">${[...games]
            .reverse()
            .slice(0, 10)
            .map(
              (g) => `<li><span class="r ${g.result}">${icon[g.result]}</span><span>${g.userColor === 'white' ? '♔' : '♚'} ${esc(t('levels')[g.level] ?? '')}</span>
              <span class="mv">✓${g.good} ✗${g.bad}</span><time>${esc(fmt.format(g.date))}</time></li>`,
            )
            .join('')}</ul>`
        : ''
    }`;
}

// ---- boot ----
(async function boot() {
  const lang = await getSetting('lang', null);
  setLang(lang || detectLang());
  setSoundOn(await getSetting('sound', true));
  mount('splash', {}, '');
})();

if (import.meta.env.DEV) window.__wc = { go };
