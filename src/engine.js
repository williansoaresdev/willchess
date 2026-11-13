// Thin async wrapper around Stockfish (WASM, single-thread lite build) running in a Web Worker.
const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export const MATE_CP = 10000;
export const CAP_CP = 1000; // scores are clamped to ±10 pawns when comparing moves

export function scoreToCp(s) {
  if (!s) return 0;
  if (s.type === 'mate') return s.value > 0 ? MATE_CP - s.value : -MATE_CP - s.value;
  return s.value;
}
export const clampCp = (cp) => Math.max(-CAP_CP, Math.min(CAP_CP, cp));

export class Engine {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.listener = null;
    this.queue = Promise.resolve();
    this.worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      this.listener?.(line);
    };
    this.ready = this._init();
  }

  _wait(cmd, until) {
    return new Promise((resolve) => {
      this.listener = (line) => {
        if (line.startsWith(until)) {
          this.listener = null;
          resolve();
        }
      };
      this.worker.postMessage(cmd);
    });
  }

  async _init() {
    await this._wait('uci', 'uciok');
    await this._wait('isready', 'readyok');
  }

  _enqueue(fn) {
    const p = this.queue.then(() => this.ready).then(fn);
    this.queue = p.catch(() => {});
    return p;
  }

  /**
   * Search a position. Scores are from the side-to-move's point of view.
   * opts: { depth, movetime, multipv, searchmoves:[uci], elo (null = full strength) }
   */
  search(fen, opts = {}) {
    return this._enqueue(
      () =>
        new Promise((resolve) => {
          const { depth, movetime, multipv = 1, searchmoves, elo = null } = opts;
          const w = this.worker;
          w.postMessage(`setoption name MultiPV value ${multipv}`);
          if (elo) {
            w.postMessage('setoption name UCI_LimitStrength value true');
            w.postMessage(`setoption name UCI_Elo value ${elo}`);
          } else {
            w.postMessage('setoption name UCI_LimitStrength value false');
          }
          w.postMessage(`position fen ${fen}`);
          let go = 'go';
          if (depth) go += ` depth ${depth}`;
          if (movetime) go += ` movetime ${movetime}`;
          if (searchmoves?.length) go += ` searchmoves ${searchmoves.join(' ')}`;

          const lines = new Map();
          this.listener = (line) => {
            if (line.startsWith('info ') && line.includes(' pv ') && !/bound/.test(line)) {
              const m = line.match(/ depth (\d+) .*?score (cp|mate) (-?\d+).*? pv (.+)$/);
              if (m) {
                const idx = Number((line.match(/ multipv (\d+)/) || [])[1] || 1);
                lines.set(idx, {
                  depth: Number(m[1]),
                  score: { type: m[2], value: Number(m[3]) },
                  pv: m[4].trim().split(/\s+/),
                });
              }
            } else if (line.startsWith('bestmove')) {
              this.listener = null;
              const best = line.split(/\s+/)[1];
              const arr = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
              resolve({ best, lines: arr });
            }
          };
          w.postMessage(go);
        }),
    );
  }

  stop() {
    this.worker.postMessage('stop');
  }

  terminate() {
    this.worker.terminate();
  }
}
