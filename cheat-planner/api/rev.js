import { getRev } from '../lib/store.js';
import { send, fail } from '../lib/http.js';

// GET /api/rev → cheap check the page polls to see whether anyone changed something
export default async function handler(req, res) {
  try {
    send(res, 200, { rev: await getRev() }, { 'Cache-Control': 'no-store' });
  } catch (e) {
    fail(res, e);
  }
}
