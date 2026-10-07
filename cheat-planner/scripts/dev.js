// Local preview without Vercel: serves public/ and the /api routes. Uses an in-memory
// database (seeded from lib/seed.js) unless KV env vars are set.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
const routes = Object.fromEntries(await Promise.all(['state', 'rev', 'write', 'upload', 'blob'].map(async (r) => [r, (await import(`../api/${r}.js`)).default])));

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let m = u.pathname.match(/^\/_blob\/([0-9a-f]{32})$/);
  if (m) { req.url = `/api/blob?id=${m[1]}`; return routes.blob(req, res); }
  m = u.pathname.match(/^\/api\/(\w+)$/);
  if (m && routes[m[1]]) return routes[m[1]](req, res);
  const p = normalize(join(root, u.pathname === '/' ? 'index.html' : u.pathname));
  if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try { const b = await readFile(p); res.setHeader('Content-Type', types[extname(p)] || 'application/octet-stream'); res.end(b); }
  catch { res.statusCode = 404; res.end('not found'); }
}).listen(process.env.PORT || 3000, () => console.log(`Cheat planner on http://localhost:${process.env.PORT || 3000}`));
