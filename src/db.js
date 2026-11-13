// Local persistence in IndexedDB (no cloud, no login). Falls back to memory if unavailable.
const DB_NAME = 'willchess';
let dbPromise = null;
const mem = { settings: new Map(), stats: new Map(), games: [] };

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('stats', { keyPath: 'color' });
        db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const res = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(res?.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function getSetting(key, def) {
  try {
    const db = await open();
    if (!db) return mem.settings.has(key) ? mem.settings.get(key) : def;
    const r = await run('settings', 'readonly', (s) => s.get(key));
    return r ? r.value : def;
  } catch {
    return def;
  }
}

export async function setSetting(key, value) {
  mem.settings.set(key, value);
  try {
    if (await open()) await run('settings', 'readwrite', (s) => s.put({ key, value }));
  } catch {}
}

const emptyStat = (color) => ({ color, good: 0, bad: 0 });

/** Record one evaluated move for the color the user was playing. */
export async function addMove(color, good) {
  try {
    const db = await open();
    if (!db) {
      const s = mem.stats.get(color) || emptyStat(color);
      good ? s.good++ : s.bad++;
      mem.stats.set(color, s);
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('stats', 'readwrite');
      const st = tx.objectStore('stats');
      const g = st.get(color);
      g.onsuccess = () => {
        const s = g.result || emptyStat(color);
        good ? s.good++ : s.bad++;
        st.put(s);
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function getStats() {
  const out = { white: emptyStat('white'), black: emptyStat('black') };
  try {
    const db = await open();
    if (!db) {
      for (const [c, s] of mem.stats) out[c] = s;
      return out;
    }
    const rows = await run('stats', 'readonly', (s) => s.getAll());
    for (const r of rows || []) out[r.color] = r;
  } catch {}
  return out;
}

export async function addGame(game) {
  try {
    const db = await open();
    if (!db) return void mem.games.push(game);
    await run('games', 'readwrite', (s) => s.add(game));
  } catch {}
}

export async function getGames() {
  try {
    const db = await open();
    if (!db) return [...mem.games];
    return (await run('games', 'readonly', (s) => s.getAll())) || [];
  } catch {
    return [];
  }
}
