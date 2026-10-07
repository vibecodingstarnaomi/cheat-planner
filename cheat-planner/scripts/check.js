// Build-time sanity checks: the page script parses, and every API route imports cleanly.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
if (!html.includes('/shim.js')) throw new Error('index.html is missing shim.js');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const dir = mkdtempSync(join(tmpdir(), 'chk-'));
scripts.forEach((s, i) => { const f = join(dir, `s${i}.js`); writeFileSync(f, s); execFileSync(process.execPath, ['--check', f]); });
execFileSync(process.execPath, ['--check', new URL('../public/shim.js', import.meta.url).pathname]);
for (const r of ['state', 'rev', 'write', 'upload', 'blob']) await import(`../api/${r}.js`);
console.log(`check ok: ${scripts.length} page script(s), shim, 5 API routes`);
