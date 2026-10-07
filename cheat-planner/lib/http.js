// Tiny helpers that work the same on Vercel Node functions and the local dev server.
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  if (Buffer.isBuffer(body) || typeof body === 'string') return res.end(body);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody(req, limit = 4_400_000) {
  if (req.body !== undefined && req.body !== null && !(req.readable)) {
    // Body already parsed by the platform
    return Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('File is too large (max about 4 MB).'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export function fail(res, e) {
  send(res, e.status || 500, { error: e.message || 'Server error' });
}
