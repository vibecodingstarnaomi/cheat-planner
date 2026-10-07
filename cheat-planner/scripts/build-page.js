// Wraps the planner page (src/planner.html, the same file published on claude.ai)
// into a full HTML document for Vercel, with shim.js loaded first.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/planner.html', import.meta.url), 'utf8');
const cut = src.indexOf('</style>') + '</style>'.length; // title, fonts and styles go in <head>
if (cut < 8) throw new Error('src/planner.html: no <style> block found');
const head = src.slice(0, cut);
const body = src.slice(cut);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%237A2350'/%3E%3Ctext x='16' y='22' font-size='18' text-anchor='middle' fill='%23fff' font-family='Arial'%3EC%3C/text%3E%3C/svg%3E">
${head}
<script src="/shim.js"></script>
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync(new URL('../public/index.html', import.meta.url), html);
console.log('public/index.html written (' + html.length + ' bytes)');
