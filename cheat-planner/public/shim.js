// Stands in for claude.ai's runtime (window.claude.use) so the planner page runs unchanged on Vercel.
// db        → /api/state + /api/write, with polling every few seconds so teammates see each other's edits
// assets    → /api/upload, photos served at /_blob/<id>
// user      → a per-browser id plus an optional display name for the activity log
// downloads → a normal browser download
(function () {
  const POLL_MS = 4000;
  let state = null;
  let rev = -1;
  let pending = 0;
  const listeners = new Set();
  let loading = null;

  const uid = (() => {
    try {
      let v = localStorage.getItem('cheat.uid');
      if (!v) { v = 'u_' + Math.random().toString(36).slice(2, 12); localStorage.setItem('cheat.uid', v); }
      return v;
    } catch (_) { return 'u_anon'; }
  })();

  async function load() {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error('load failed'), { code: 'store_unavailable' });
    const s = await r.json();
    rev = s.rev;
    state = s;
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  function ready() { return loading || (loading = load()); }

  async function poll() {
    if (pending || document.hidden) return;
    try {
      const r = await fetch('/api/rev', { cache: 'no-store' });
      if (!r.ok) return;
      const { rev: now } = await r.json();
      if (now !== rev && !pending) await load();
    } catch (_) { /* offline: try again next tick */ }
  }
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  function emitSoon() { setTimeout(() => listeners.forEach((fn) => fn()), 0); }

  async function send(body) {
    // optimistic local update so the page reacts instantly
    const col = (state[body.col] = state[body.col] || {});
    if (body.op === 'delete') delete col[body.id]; else col[body.id] = JSON.parse(JSON.stringify(body.data));
    emitSoon();
    pending++;
    try {
      const r = await fetch('/api/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'save failed'), { code: 'store_unavailable' });
      rev = j.rev;
      return j;
    } catch (e) {
      await load().catch(() => {}); // re-sync with the server's version
      throw e;
    } finally { pending--; }
  }

  function snap(col, order, limit) {
    let ents = Object.entries((state && state[col]) || {});
    if (order) {
      const [f, dir] = order;
      ents.sort((a, b) => { const x = a[1][f] ?? '', y = b[1][f] ?? ''; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); });
    }
    if (limit) ents = ents.slice(0, limit);
    return { docs: ents.map(([id, d]) => ({ id, exists: true, data: () => d })), docChanges: () => [], metadata: {} };
  }

  function query(col, order = null, limit = 0) {
    return {
      orderBy: (f, dir = 'asc') => query(col, [f, dir], limit),
      limit: (n) => query(col, order, n),
      where: () => query(col, order, limit),
      onSnapshot(next, err) {
        const fn = () => next(snap(col, order, limit));
        listeners.add(fn);
        ready().then(fn).catch((e) => err && err(e));
        return () => listeners.delete(fn);
      },
      doc: (id) => ({
        set: (data) => send({ op: 'set', col, id, data }),
        delete: () => send({ op: 'delete', col, id }),
      }),
      add: async (data) => { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); await send({ op: 'set', col, id, data }); return { id }; },
    };
  }

  const db = {
    collection: (col) => query(col),
    doc(path) {
      const [col, id] = path.split('/');
      return {
        onSnapshot(next, err) {
          const fn = () => { const d = state && state[col] && state[col][id]; next({ id, exists: !!d, data: () => d }); };
          listeners.add(fn);
          ready().then(fn).catch((e) => err && err(e));
          return () => listeners.delete(fn);
        },
        set: (data) => send({ op: 'set', col, id, data }),
        delete: () => send({ op: 'delete', col, id }),
      };
    },
  };

  // names for the activity log: asked once per browser, the first time someone edits
  function myName() { try { return localStorage.getItem('cheat.name') || ''; } catch (_) { return ''; } }
  let asked = false;
  function askName() {
    if (asked || myName()) return;
    asked = true;
    const n = (window.prompt('Your first name (shown in the activity log):') || '').trim().slice(0, 40);
    if (!n) return;
    try { localStorage.setItem('cheat.name', n); } catch (_) {}
    send({ op: 'set', col: 'people', id: uid, data: { name: n } }).catch(() => {});
  }
  const _send = send;
  send = async function (body) { if (body.col !== 'people') askName(); return _send(body); };

  const user = {
    can: async () => true,
    id: async () => uid,
    profiles: async (ids) => { await ready(); const p = state.people || {}; return Object.fromEntries(ids.map((i) => [i, { name: (p[i] && p[i].name) || '' }])); },
  };

  const assets = {
    async upload(blob, opts = {}) {
      const type = opts.type || blob.type || 'application/octet-stream';
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': type }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'upload failed'), { code: r.status === 413 ? 'too_large' : r.status === 415 ? 'unsupported_type' : 'upstream_error' });
      return j;
    },
    list: async () => ({ assets: [], usage: {} }),
    delete: async () => ({ deleted: false }),
  };

  const downloads = {
    async save({ filename, data, type }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return { saved: true };
    },
  };

  const caps = { db, user, assets, downloads };
  window.claude = { use: (name) => Promise.resolve(caps[name] || null) };
})();
