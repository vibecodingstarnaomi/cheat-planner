import { getState } from '../lib/store.js';
import { send, fail } from '../lib/http.js';

// GET /api/state → every collection plus the current revision number
export default async function handler(req, res) {
  try {
    send(res, 200, await getState(), { 'Cache-Control': 'no-store' });
  } catch (e) {
    fail(res, e);
  }
}
