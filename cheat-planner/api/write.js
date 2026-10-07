import { write } from '../lib/store.js';
import { send, readBody, fail } from '../lib/http.js';

// POST /api/write  { op: 'set'|'delete'|'add', col, id?, data? }
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const body = JSON.parse((await readBody(req, 300_000)).toString('utf8') || '{}');
    send(res, 200, await write(body));
  } catch (e) {
    fail(res, e);
  }
}
