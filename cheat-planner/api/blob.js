import { getAsset } from '../lib/store.js';
import { send, fail } from '../lib/http.js';

// GET /_blob/:id (rewritten to /api/blob?id=…) → the stored photo or PDF
export default async function handler(req, res) {
  try {
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    if (!/^[0-9a-f]{32}$/.test(id)) return send(res, 400, { error: 'bad id' });
    const a = await getAsset(id);
    if (!a) return send(res, 404, { error: 'not found' });
    if (a.redirect) return send(res, 302, undefined, { Location: a.redirect, 'Cache-Control': 'public, max-age=86400' });
    send(res, 200, a.buf, { 'Content-Type': a.contentType, 'Cache-Control': 'public, max-age=86400' });
  } catch (e) {
    fail(res, e);
  }
}
