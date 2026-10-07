// Storage layer. Production: Upstash Redis (Vercel KV) + Vercel Blob.
// Local dev (no KV env vars): an in-memory store so `npm run dev` works offline.
import seed from './seed.js';

export const COLLECTIONS = ['skus', 'bundles', 'meta', 'trash', 'log', 'people'];

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const usingKV = Boolean(KV_URL && KV_TOKEN);

let redis = null;
async function kv() {
  if (!redis) {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({ url: KV_URL, token: KV_TOKEN });
  }
  return redis;
}

// ---- in-memory fallback (dev only) ----
const mem = globalThis.__cheatMem || (globalThis.__cheatMem = { hashes: {}, rev: 0, seeded: false, blobs: {} });

const key = (col) => `c:${col}`;
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export async function ensureSeeded() {
  if (usingKV) {
    const r = await kv();
    const done = await r.set('seeded', '1', { nx: true }); // only the first caller seeds
    if (done !== 'OK') return;
    const p = r.pipeline();
    for (const col of ['skus', 'bundles', 'meta', 'trash', 'log']) {
      const docs = seed[col] || {};
      const entries = Object.entries(docs);
      for (let i = 0; i < entries.length; i += 200) {
        const chunk = Object.fromEntries(entries.slice(i, i + 200).map(([id, d]) => [id, JSON.stringify(d)]));
        p.hset(key(col), chunk);
      }
    }
    p.incr('rev');
    await p.exec();
    return;
  }
  if (mem.seeded) return;
  for (const col of ['skus', 'bundles', 'meta', 'trash', 'log']) {
    mem.hashes[col] = Object.fromEntries(Object.entries(seed[col] || {}).map(([id, d]) => [id, JSON.stringify(d)]));
  }
  mem.rev = 1;
  mem.seeded = true;
}

export async function getRev() {
  if (usingKV) return Number((await (await kv()).get('rev')) || 0);
  return mem.rev;
}

export async function getState() {
  await ensureSeeded();
  const out = {};
  if (usingKV) {
    const r = await kv();
    const p = r.pipeline();
    for (const col of COLLECTIONS) p.hgetall(key(col));
    p.get('rev');
    const res = await p.exec();
    COLLECTIONS.forEach((col, i) => {
      const h = res[i] || {};
      out[col] = Object.fromEntries(Object.entries(h).map(([id, v]) => [id, parse(v)]));
    });
    out.rev = Number(res[COLLECTIONS.length] || 0);
  } else {
    for (const col of COLLECTIONS) {
      out[col] = Object.fromEntries(Object.entries(mem.hashes[col] || {}).map(([id, v]) => [id, parse(v)]));
    }
    out.rev = mem.rev;
  }
  // keep the payload small: newest 1000 activity entries
  const logs = Object.entries(out.log).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
  if (logs.length > 1000) out.log = Object.fromEntries(logs.slice(0, 1000));
  return out;
}

export async function write({ op, col, id, data }) {
  if (!COLLECTIONS.includes(col)) throw Object.assign(new Error('unknown collection'), { status: 400 });
  if (op === 'add') id = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  if (!id || typeof id !== 'string' || id.length > 200) throw Object.assign(new Error('bad id'), { status: 400 });
  if (op === 'set' || op === 'add') {
    const s = JSON.stringify(data ?? {});
    if (s.length > 200_000) throw Object.assign(new Error('document too large'), { status: 413 });
    if (usingKV) {
      const r = await kv();
      const p = r.pipeline();
      p.hset(key(col), { [id]: s });
      p.incr('rev');
      const res = await p.exec();
      return { id, rev: Number(res[1]) };
    }
    (mem.hashes[col] = mem.hashes[col] || {})[id] = s;
    return { id, rev: ++mem.rev };
  }
  if (op === 'delete') {
    if (usingKV) {
      const r = await kv();
      const p = r.pipeline();
      p.hdel(key(col), id);
      p.incr('rev');
      const res = await p.exec();
      return { id, rev: Number(res[1]) };
    }
    if (mem.hashes[col]) delete mem.hashes[col][id];
    return { id, rev: ++mem.rev };
  }
  throw Object.assign(new Error('unknown op'), { status: 400 });
}

// ---- photos / PDFs ----
export async function saveAsset(buf, contentType) {
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (usingKV) {
    const { put } = await import('@vercel/blob');
    const ext = (contentType.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5);
    const blob = await put(`assets/${id}.${ext}`, buf, { access: 'public', contentType, addRandomSuffix: false });
    await (await kv()).hset('assets', { [id]: blob.url });
    return { id, url: `/_blob/${id}` };
  }
  mem.blobs[id] = { buf, contentType };
  return { id, url: `/_blob/${id}` };
}

export async function getAsset(id) {
  if (seed.seedAssets.includes(id)) return { redirect: `/seed-assets/${id}.png` };
  if (usingKV) {
    const url = await (await kv()).hget('assets', id);
    return url ? { redirect: url } : null;
  }
  return mem.blobs[id] || null;
}
