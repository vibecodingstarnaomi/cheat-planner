import { saveAsset } from '../lib/store.js';
import { send, readBody, fail } from '../lib/http.js';

const OK = /^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf)$/;

// POST /api/upload  (raw file body, Content-Type header = file type)
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!OK.test(type)) return send(res, 415, { error: 'Only images and PDFs can be attached.' });
    const buf = await readBody(req);
    if (!buf.length) return send(res, 400, { error: 'Empty file' });
    send(res, 200, { ...(await saveAsset(buf, type)), sizeBytes: buf.length, contentType: type });
  } catch (e) {
    fail(res, e);
  }
}
