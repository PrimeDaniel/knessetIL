# Netlify + Supabase + Render deployment

End-to-end walkthrough for putting KnessetIL on the public internet.

| Piece                     | Host                              | Why                                                                 |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `apps/web` (Next.js 14)   | **Netlify**                       | App Router supported via `@netlify/plugin-nextjs`.                  |
| `apps/api` (FastAPI)      | **Render** (recommended)          | Long-running Python process — APScheduler 6h sync needs that.       |
| PostgreSQL                | **Supabase**                      | Managed Postgres, free tier fits the Knesset-25-only subset.        |
| Redis                     | Optional in prod                  | Code only uses an in-memory cache; Redis URL stays for parity.      |

> **Why not Netlify Functions for the API?** The backend runs a 6-hour `APScheduler`
> sync job that ingests ~14 MB of CSV per cycle into Postgres, plus an in-memory
> TTL cache. Both rely on a long-lived process. Serverless functions would lose
> the cache on every cold start and have no equivalent to the scheduler.

---

## 0. Prerequisites

- A GitHub account with this repo pushed to a remote.
- Free accounts on: [Supabase](https://supabase.com), [Render](https://render.com), [Netlify](https://app.netlify.com).
- Local: `pnpm`, Python 3.11+, and (optional) the [Netlify CLI](https://docs.netlify.com/cli/get-started/) — `npm i -g netlify-cli`.

---

## 1. Supabase: create the database

1. **Create project**: Supabase dashboard → *New project*. Pick a region close to where Render will host the API (Frankfurt and Ireland are both fine). Record the *database password* you set — there's no way to recover it later.
2. **Get the connection string**: *Project settings → Database → Connection string → URI*. Use the **"Transaction" pooler** string (port `6543`), not the direct connection. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
3. **Convert it for asyncpg**: swap the driver prefix and append SSL:
   ```
   postgresql+asyncpg://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?ssl=require
   ```
   This is the `DATABASE_URL` you'll set on Render.
4. **Get the project URL + anon/service keys**: *Project settings → API*. You won't use these unless you later swap from the FastAPI client to direct Supabase SDK access — store them anyway, they're handy.

### Create the schema

The schema is defined as Alembic migrations under `apps/api/alembic/versions/`. You don't need to paste hand-written SQL.

From your local machine, with the Python venv active:

```powershell
cd apps\api
# Override DATABASE_URL for this one command — the migration runs against Supabase.
$env:DATABASE_URL = "postgresql+asyncpg://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?ssl=require"
alembic upgrade head
```

This creates: `members`, `member_factions`, `factions`, `bills`, `bill_initiators`, `vote_headers`, `vote_decisions` and the supporting indexes. Verify in *Supabase dashboard → Table editor* — you should see seven empty tables.

---

## 2. Render: host the FastAPI backend

1. Render dashboard → *New → Web Service* → connect your GitHub repo.
2. Configure the service:
   - **Root directory**: `apps/api`
   - **Runtime**: Python 3
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free is fine to start; upgrade if cold starts bother you.
3. **Set environment variables** in *Render → Environment*:

   | Key                              | Value                                                         |
   | -------------------------------- | ------------------------------------------------------------- |
   | `APP_ENV`                        | `production`                                                  |
   | `DATABASE_URL`                   | The Supabase asyncpg connection string from step 1            |
   | `ALLOWED_ORIGINS`                | `https://<your-site>.netlify.app` (add your domain too)       |
   | `OKNESSET_KNESSET_FILTER`        | `25` — restricts sync to current Knesset, fits free tier      |
   | `OKNESSET_SYNC_INTERVAL_HOURS`   | `6` (or higher if you want to be gentler)                     |
   | `LOG_LEVEL`                      | `INFO`                                                        |

4. Deploy. After it boots, hit `https://<your-render-app>.onrender.com/api/v1/health` — it should return `{"status":"ok","env":"production"}`.
5. **Trigger the first sync** (otherwise tables stay empty until the 6h timer fires). Render → *Shell* (paid plans) or just wait for the first scheduled run. To force one immediately, SSH-equivalent isn't free, so easier path:
   ```powershell
   # From your machine, with DATABASE_URL pointing at Supabase:
   cd apps\api
   $env:OKNESSET_KNESSET_FILTER = "25"
   python -c "import asyncio; from app.tasks.sync import run_sync; asyncio.run(run_sync())"
   ```
   Filtered to Knesset 25 this takes ~30s and produces roughly 10K vote_decisions (vs. 1.27 M unfiltered).

---

## 3. Netlify: host the frontend

1. Netlify dashboard → *Add new site → Import an existing project* → pick the GitHub repo.
2. Netlify reads `netlify.toml` at the repo root — leave the build settings as detected. The key settings (already in `netlify.toml`):
   - Base directory: `apps/web`
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Publish directory: `apps/web/.next`
   - Plugin: `@netlify/plugin-nextjs`
3. **Set environment variables** in *Site settings → Environment variables*:

   | Key                              | Value                                                |
   | -------------------------------- | ---------------------------------------------------- |
   | `NEXT_PUBLIC_API_URL`            | `https://<your-render-app>.onrender.com` (no trailing slash) |
   | `NEXT_PUBLIC_ENABLE_ANALYTICS`   | `false`                                              |

4. Trigger the deploy. After it goes green, visit the site URL. The home page should hit `/api/v1/stats/dashboard` on Render and render the Hebrew dashboard.

> **Don't forget**: once you know the Netlify URL, go back to Render and add it to `ALLOWED_ORIGINS`. Without that the browser will block the API calls with a CORS error.

---

## 4. Test locally first (recommended)

You don't have to push to verify the deploy shape works. Two options:

### A. Plain local dev (matches CLAUDE.md)
```powershell
.\run-local.ps1   # Redis + uvicorn + Next.js, all local
```
This is the fastest feedback loop and what you should use for actual development.

### B. Simulate the Netlify build
Use this once before pushing, to confirm `netlify.toml` is wired up right:
```powershell
netlify dev --dir=apps/web
```
The CLI loads `netlify.toml`, runs `next dev` from `apps/web`, and exposes the site on `http://localhost:8888`. Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to wherever you want it to read from — your local API, or the deployed Render URL once it's live.

To build exactly as Netlify will:
```powershell
netlify build
```
A clean run here is a strong signal the cloud deploy will succeed.

---

## 5. Full env-var inventory

Anything with a real value lives only in dashboards / `.env` (gitignored). The template is `.env.example` at the repo root.

**Render (API)**

- `APP_ENV` — `production`
- `DATABASE_URL` — Supabase asyncpg URL with `?ssl=require`
- `ALLOWED_ORIGINS` — comma-separated, includes your Netlify URL
- `OKNESSET_KNESSET_FILTER` — `25` to fit Supabase free tier
- `OKNESSET_SYNC_INTERVAL_HOURS` — `6` default
- `LOG_LEVEL` — `INFO`
- `DATABASE_POOL_SIZE`, `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_SEARCH` — defaults are fine

**Netlify (web)**

- `NEXT_PUBLIC_API_URL` — Render URL
- `NEXT_PUBLIC_ENABLE_ANALYTICS` — `false`

**Local only**

- `apps/api/.env` — your local Postgres + Redis URLs (already set per CLAUDE.md)
- `apps/web/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:8000`

---

## 6. Things to watch after deploy

- **First Render boot** can take ~60s on the free tier (cold start). Subsequent requests are fast.
- **APScheduler runs in-process**. If Render restarts the dyno, the next sync fires on schedule from boot. No data loss — sync is idempotent (UPSERT / `ON CONFLICT DO NOTHING`).
- **Supabase free tier limits**: 500 MB database, 2 GB egress / month. The Knesset-25 subset stays well under both, but if you ever drop `OKNESSET_KNESSET_FILTER` you'll blow through the 500 MB cap on `vote_decisions` alone.
- **In-memory cache vanishes on every Render restart**. That's fine — the first request to each endpoint after a restart hits Supabase, then caches for the configured TTL.
