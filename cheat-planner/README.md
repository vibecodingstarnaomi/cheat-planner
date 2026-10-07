# Cheat Pipeline & Channels

The Cheat product planner (timeline, scents & travel, channel matrix, sets, inputs), deployed on Vercel.
Data lives in Vercel KV (Upstash Redis); photos and PDFs live in Vercel Blob. No login: anyone with the link can view and edit.

## Deploy (one time, ~10 minutes)

1. **Put this folder on GitHub.** github.com → New repository → name it `cheat-planner` (private) → "uploading an existing file" → drag in everything in this folder → Commit.
2. **Import into Vercel.** vercel.com → Add New → Project → pick `cheat-planner` → Deploy. Settings come from `vercel.json`; nothing to change.
3. **Add the database.** In the Vercel project → Storage → Create → **Upstash for Redis** (free tier) → connect it to this project.
4. **Add photo storage.** Storage → Create → **Blob** → connect it to this project.
5. **Redeploy.** Deployments → ⋯ on the latest → Redeploy, so it picks up the new storage keys.

Open the site. The first visit copies in the snapshot of the claude.ai planner (40 products, 16 sets, activity log, deleted items, photos). After that the database is the source of truth.

## How it works

- `src/planner.html` is the same page published on claude.ai. `npm run build` wraps it into `public/index.html` and loads `public/shim.js` first.
- `public/shim.js` provides the `window.claude.use(...)` calls the page expects (database, photos, user, downloads) using this project's `/api` routes. Open tabs check for teammates' changes every 4 seconds.
- `api/`: `state` (read everything), `rev` (has anything changed?), `write` (save or delete one record), `upload` (photos/PDFs, max about 4 MB), `blob` (serves them at `/_blob/<id>`).
- `lib/seed.js`: the one-time snapshot, only used when the database is empty.

## Updating the page later

Replace `src/planner.html` with a newer version of the claude.ai page, commit, and Vercel redeploys. Data is untouched.

## Run locally

```
npm install
npm run dev   # http://localhost:3000, in-memory data (resets when stopped)
```

Notes: the claude.ai planner and this site are separate copies, so edits in one don't appear in the other.
Anyone with the link can edit; Undo, Recently deleted and the Activity log are the safety net.
