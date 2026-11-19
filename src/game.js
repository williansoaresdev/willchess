import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { t } from './i18n.js';
import { Engine, scoreToCp, clampCp } from './engine.js';
import { play } from './sound.js';
import { addMove, addGame, setSetting } from './db.js';
import { musicStart, musicStop, musicSetLevel, musicSetProgress, musicSetEnabled, isMusicEnabled } from './music.js';
import { h, esc, sleep, modal, confirmBox } from './ui.js';

export const LEVELS = [
  { id: 0, elo: 1350 },
  { id: 1, elo: 1600 },
  { id: 2, elo: 1900 },
  { id: 3, elo: 2200 },
  { id: 4, elo: 2600 },
  { id: 5, elo: null }, // full strength
];

const THRESHOLD = 100; // centipawns: "more than 1 point"
const ANALYSIS = { depth: 12, movetime: 3000 };
const REPLAY_PLIES = 5;
const REPLAY_DELAY = 1000;

const cname = (c) => (c === 'w' ? 'white' : 'black');

function fmtScore(s, sign = true) {
  if (s.type === 'mate') return (s.value > 0 ? '' : '-') + '#' + Math.abs(s.value);
  const v = s.value / 100;
  return (sign && v > 0 ? '+' : '') + v.toFixed(2);
}

export function createGame(root, { userColor, level, engine, timeMs, onEnd, onLeave }) {
  const chess = new Chess();
  const cache = new Map();
  let phase = 'busy';
  let destroyed = false;
  let counts = { good: 0, bad: 0 };
  let alertCtx = null;
  let failFen = null; // position where the user is failing
  let failCount = 0; // consecutive bad moves in that position

  root.innerHTML = '';
  const el = h(`
    <div class="game">
      <div class="game-top">
        <button class="btn small ghost" data-leave>← ${esc(t('leave'))}</button>
        <div class="clock-wrap" aria-live="off">
          <div class="clock" data-clock>--:--</div>
          <div class="clock-bar"><i data-clockbar></i></div>
        </div>
        <div class="top-right">
          <div class="counters"><span class="chip good">✓ <b data-good>0</b></span><span class="chip bad">✗ <b data-bad>0</b></span></div>
          <button class="icon-btn mini" data-music title="${esc(t('music'))}" aria-label="${esc(t('music'))}"></button>
        </div>
      </div>
      <div class="game-body">
        <div class="board-box"><div class="cg-host"></div></div>
        <aside class="panel">
          <div class="game-info">${esc(t('youPlay', { c: t(userColor) }))} · ${esc(t('levels')[level.id])}</div>
          <div class="status" data-status></div>
          <div class="alert-box" data-alert hidden></div>
        </aside>
      </div>
    </div>`);
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const statusEl = $('[data-status]');
  const alertEl = $('[data-alert]');

  const cg = Chessground($('.cg-host'), {
    fen: chess.fen(),
    orientation: userColor,
    coordinates: true,
    animation: { enabled: true, duration: 320 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, color: undefined, dests: new Map(), showDests: true, events: { after: (o, d) => onUserMove(o, d) } },
    draggable: { showGhost: true },
    premovable: { enabled: false },
    drawable: { enabled: false, visible: true },
  });

  // Chessground caches the board's screen position. The screen slides in with a CSS transform,
  // so it must be re-measured once the animation ends and whenever the layout changes.
  const remeasure = () => {
    if (!destroyed) cg.redrawAll();
  };
  const screenEl = root.closest('.screen') || root;
  screenEl.addEventListener('animationend', remeasure);
  const t1 = setTimeout(remeasure, 600);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
  ro?.observe($('.board-box'));
  window.addEventListener('resize', remeasure);
  window.addEventListener('orientationchange', remeasure);

  // ---- game clock (the user's total thinking time) + suspense music ----
  // The clock only runs while it is the user's turn to move (not during analysis, alerts or replays).
  let remaining = timeMs;
  let lastTick = performance.now();
  let lastSecond = Math.ceil(remaining / 1000);
  const clockEl = $('[data-clock]');
  const barEl = $('[data-clockbar]');
  const musicBtn = $('[data-music]');
  const renderMusicBtn = () => {
    musicBtn.textContent = isMusicEnabled() ? '♪' : '♪̸';
    musicBtn.classList.toggle('off', !isMusicEnabled());
  };
  renderMusicBtn();
  musicBtn.onclick = () => {
    musicSetEnabled(!isMusicEnabled());
    setSetting('music', isMusicEnabled());
    renderMusicBtn();
  };
  function fmtClock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function renderClock() {
    const elapsed = 1 - remaining / timeMs;
    clockEl.textContent = fmtClock(remaining);
    clockEl.classList.toggle('mid', elapsed >= 1 / 3 && elapsed < 2 / 3);
    clockEl.classList.toggle('low', elapsed >= 2 / 3);
    clockEl.classList.toggle('crit', remaining <= 10000 && remaining > 0);
    barEl.style.width = Math.max(0, (remaining / timeMs) * 100) + '%';
    barEl.className = elapsed >= 2 / 3 ? 'low' : elapsed >= 1 / 3 ? 'mid' : '';
    musicSetLevel(elapsed < 1 / 3 ? 0 : elapsed < 2 / 3 ? 1 : 2);
    musicSetProgress(elapsed >= 2 / 3 ? (elapsed - 2 / 3) * 3 : 0);
  }
  function tickClock() {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    if (destroyed || phase !== 'user' || document.hidden) return;
    remaining -= Math.min(dt, 1000);
    const sec = Math.ceil(remaining / 1000);
    if (sec !== lastSecond) {
      lastSecond = sec;
      if (remaining > 0 && remaining <= 10000) play('tick');
    }
    if (remaining <= 0) {
      remaining = 0;
      renderClock();
      return timeUp();
    }
    renderClock();
  }
  function timeUp() {
    if (phase === 'over') return;
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    cg.set({ movable: { color: undefined, dests: new Map() } });
    setStatus('timeUp', 'bad');
    play('alert');
    finish('time');
  }
  renderClock();
  const clockTimer = setInterval(tickClock, 100);

  function setStatus(key, cls = '') {
    statusEl.className = 'status ' + cls;
    statusEl.textContent = t(key);
  }
  function updateCounts() {
    $('[data-good]').textContent = counts.good;
    $('[data-bad]').textContent = counts.bad;
  }
  function dests() {
    const m = new Map();
    for (const mv of chess.moves({ verbose: true })) {
      if (!m.has(mv.from)) m.set(mv.from, []);
      m.get(mv.from).push(mv.to);
    }
    return m;
  }
  function refresh(lastMove) {
    cg.set({
      fen: chess.fen(),
      turnColor: cname(chess.turn()),
      check: chess.inCheck() ? cname(chess.turn()) : false,
      lastMove,
      movable: { color: phase === 'user' ? userColor : undefined, dests: phase === 'user' ? dests() : new Map() },
    });
  }
  const analyze = (fen) => {
    if (!cache.has(fen)) cache.set(fen, engine.search(fen, { ...ANALYSIS, multipv: 3 }));
    return cache.get(fen);
  };
  const sfx = (mv) => play(mv.flags.includes('c') || mv.flags.includes('e') ? 'capture' : 'move');

  function userTurn() {
    if (destroyed) return;
    lastTick = performance.now();
    phase = 'user';
    setStatus('yourTurn', 'turn');
    const last = chess.history({ verbose: true }).at(-1);
    refresh(last ? [last.from, last.to] : undefined);
    analyze(chess.fen()); // warm up analysis while the user thinks
  }

  function askPromotion() {
    const color = userColor;
    const el = h(`<div><p class="modal-text">${esc(t('promoteTitle'))}</p><div class="promo">
      ${['queen', 'rook', 'bishop', 'knight']
        .map((r) => `<button data-p="${{ queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[r]}"><div class="cg-wrap"><piece class="${r} ${color}"></piece></div></button>`)
        .join('')}</div></div>`);
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => el.close(b.dataset.p)));
    return modal(el);
  }

  async function onUserMove(orig, dest) {
    if (phase !== 'user' || destroyed) return;
    const cands = chess.moves({ square: orig, verbose: true }).filter((m) => m.to === dest);
    if (!cands.length) return refresh();
    let move = cands[0];
    if (move.promotion) {
      const p = await askPromotion();
      move = cands.find((m) => m.promotion === p);
      if (!move) return refresh();
    }
    const preFen = chess.fen();
    phase = 'busy';
    const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    sfx(played);
    refresh([played.from, played.to]);

    if (chess.isGameOver()) {
      counts.good++;
      updateCounts();
      addMove(userColor, true);
      return finish();
    }

    setStatus('analyzing', 'busy');
    const uci = played.from + played.to + (played.promotion || '');
    try {
      const pre = await analyze(preFen);
      if (destroyed) return;
      const best = clampCp(scoreToCp(pre.lines[0].score));
      let playedScore;
      const hit = pre.lines.find((l) => l.pv[0] === uci);
      if (hit) playedScore = hit.score;
      else {
        const r = await engine.search(preFen, { ...ANALYSIS, searchmoves: [uci] });
        if (destroyed) return;
        playedScore = r.lines[0].score;
      }
      const loss = Math.max(0, best - clampCp(scoreToCp(playedScore)));
      const bad = loss > THRESHOLD;
      bad ? counts.bad++ : counts.good++;
      if (bad) {
        if (preFen === failFen) failCount++;
        else {
          failFen = preFen;
          failCount = 1;
        }
      } else failFen = null, failCount = 0;
      updateCounts();
      addMove(userColor, !bad);
      if (!bad) {
        play('good');
        flash(t('goodMove'));
        return engineMove();
      }
      showAlert({ pre, preFen, played, loss, reveal: failCount >= 2 });
    } catch (e) {
      console.error(e);
      engineMove();
    }
  }

  function flash(text) {
    const f = h(`<div class="flash">${esc(text)}</div>`);
    el.querySelector('.board-box').appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  async function engineMove() {
    if (destroyed) return;
    phase = 'busy';
    setStatus('thinking', 'busy');
    const lm = chess.history({ verbose: true }).at(-1);
    refresh(lm ? [lm.from, lm.to] : undefined);
    const t0 = Date.now();
    const r = await engine.search(chess.fen(), level.elo ? { movetime: 700, elo: level.elo } : { depth: 14, movetime: 1200 });
    if (destroyed) return;
    const wait = 450 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    if (destroyed) return;
    const b = r.best;
    const mv = chess.move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] });
    sfx(mv);
    refresh([mv.from, mv.to]);
    if (chess.isGameOver()) return finish();
    userTurn();
  }

  function pvToSan(fen, pv, max = 6) {
    const c = new Chess(fen);
    const out = [];
    const startNum = Number(fen.split(' ')[5]);
    let white = c.turn() === 'w';
    let num = startNum;
    for (const u of pv.slice(0, max)) {
      let m;
      try {
        m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      } catch {
        break;
      }
      if (white) out.push(`${num}.${m.san}`);
      else {
        out.push(out.length ? m.san : `${num}…${m.san}`);
        num++;
      }
      white = !white;
    }
    return out.join(' ');
  }

  function showAlert(ctx) {
    alertCtx = ctx;
    phase = 'alert';
    play('alert');
    setStatus('mistakeTitle', 'bad');
    const { pre, preFen, played, loss, reveal } = ctx;
    const rows = pre.lines
      .slice(0, 3)
      .map(
        (l, i) => `<button class="line" data-i="${i}"><span class="rank">${i + 1}</span>
          <span class="score">${esc(fmtScore(l.score))}</span><span class="pv">${esc(pvToSan(preFen, l.pv))}</span></button>`,
      )
      .join('');
    alertEl.innerHTML = `
      <h3>⚠ ${esc(t('mistakeTitle'))} <small>(${esc(played.san)})</small></h3>
      <p>${esc(t('mistakeText', { n: (loss / 100).toFixed(1) }))}</p>
      ${
        reveal
          ? `<h4>${esc(t('bestLines'))}</h4><div class="lines">${rows}</div><p class="hint">${esc(t('tapLine'))}</p>`
          : `<p class="hint try">${esc(t('tryHint'))}</p>`
      }
      <div class="alert-actions">
        <button class="btn ghost" data-act="keep">${esc(t('keepGoing'))}</button>
        <button class="btn primary" data-act="back">↶ ${esc(t(reveal ? 'takeBack' : 'tryBetter'))}</button>
      </div>`;
    alertEl.hidden = false;
    alertEl.classList.remove('in');
    void alertEl.offsetWidth;
    alertEl.classList.add('in');
    let sel = -1;
    alertEl.querySelectorAll('.line').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.i);
        alertEl.querySelectorAll('.line').forEach((x) => x.classList.remove('sel'));
        if (sel === i) {
          sel = -1;
          restoreActual();
          return;
        }
        sel = i;
        b.classList.add('sel');
        const u = pre.lines[i].pv[0];
        cg.set({
          fen: preFen,
          lastMove: undefined,
          check: false,
          movable: { color: undefined },
          drawable: { enabled: false, visible: true, autoShapes: [] },
        });
        cg.setShapes([
          { orig: played.from, dest: played.to, brush: 'red' },
          { orig: u.slice(0, 2), dest: u.slice(2, 4), brush: 'green' },
        ]);
      };
    });
    alertEl.querySelector('[data-act=keep]').onclick = () => {
      failFen = null;
      failCount = 0;
      closeAlert();
      engineMove();
    };
    alertEl.querySelector('[data-act=back]').onclick = takeBack;
  }

  function restoreActual() {
    cg.setShapes([]);
    const last = chess.history({ verbose: true }).at(-1);
    cg.set({ fen: chess.fen(), check: chess.inCheck() ? cname(chess.turn()) : false, lastMove: last && [last.from, last.to] });
  }
  function closeAlert() {
    cg.setShapes([]);
    alertEl.hidden = true;
    alertEl.innerHTML = '';
    alertCtx = null;
  }

  async function takeBack() {
    closeAlert();
    phase = 'replay';
    chess.undo(); // back to the position where the user must move
    setStatus('replaying', 'busy');
    const hist = chess.history({ verbose: true });
    const n = hist.length;
    const start = Math.max(0, n - REPLAY_PLIES);
    const tmp = new Chess();
    for (let i = 0; i < start; i++) tmp.move(hist[i]);
    const show = (last) =>
      cg.set({
        fen: tmp.fen(),
        turnColor: cname(tmp.turn()),
        check: tmp.inCheck() ? cname(tmp.turn()) : false,
        lastMove: last ? [last.from, last.to] : undefined,
        movable: { color: undefined, dests: new Map() },
      });
    show(start > 0 ? hist[start - 1] : null);
    await sleep(REPLAY_DELAY);
    for (let i = start; i < n; i++) {
      if (destroyed) return;
      const m = tmp.move(hist[i]);
      sfx(m);
      show(m);
      await sleep(REPLAY_DELAY);
    }
    if (destroyed) return;
    userTurn();
  }

  async function finish(forced) {
    phase = 'over';
    musicStop();
    let result, reason;
    if (forced === 'time') {
      result = 'loss';
      reason = 'time';
    } else if (chess.isCheckmate()) {
      const winner = cname(chess.turn()) === userColor ? 'engine' : 'user';
      result = winner === 'user' ? 'win' : 'loss';
      reason = 'mate';
    } else {
      result = 'draw';
      reason = chess.isStalemate() ? 'stalemate' : chess.isInsufficientMaterial() ? 'material' : chess.isThreefoldRepetition() ? 'repetition' : 'fifty';
    }
    if (forced !== 'time') setStatus('congrats', 'turn');
    const game = {
      timeMin: Math.round(timeMs / 60000),
      date: Date.now(),
      userColor,
      level: level.id,
      result,
      reason,
      good: counts.good,
      bad: counts.bad,
      plies: chess.history().length,
    };
    await addGame(game);
    await sleep(1600);
    if (!destroyed) onEnd(game);
  }

  el.querySelector('[data-leave]').onclick = async () => {
    if (phase === 'over') return;
    if (await confirmBox(t('confirmLeave'))) onLeave();
  };

  // kick off
  musicStart();
  if (userColor === 'black') engineMove();
  else userTurn();

  return {
    destroy() {
      destroyed = true;
      clearInterval(clockTimer);
      musicStop();
      clearTimeout(t1);
      ro?.disconnect();
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      try {
        engine.stop();
        cg.destroy();
      } catch {}
    },
  };
}

export { Engine };
