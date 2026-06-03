# Netlify + Supabase + Render deployment

End-to-end walkthrough for putting KnessetIL on the public internet.

| Piece                     | Host                              | Why                                                                 |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `apps/web` (Next.js 14)   | **Netlify**                       | App Router supported via `@netlify/plugin-nextjs`.                  |
| `apps/api` (FastAPI)      | **Render free** (scale-to-zero)   | Stateless reads from Supabase; sleeps when idle, free.              |
| **6h data sync**          | **GitHub Actions** cron           | Runs `run_sync()` 4×/day regardless of whether the API is awake.    |
| PostgreSQL                | **Supabase**                      | Managed Postgres, free tier fits the Knesset-25-only subset.        |
| Redis                     | Optional in prod                  | Code only uses an in-memory cache; Redis URL stays for parity.      |

### Architecture rationale (free, ~500 low-traffic users)

The only part that needs to run on a clock is the **6-hour sync** — and that's a
cron job, not a server. So we split it out:

- The **sync** runs as a **GitHub Actions scheduled workflow**
  (`.github/workflows/sync.yml`). The Knesset-25-filtered sync takes ~30s and runs
  4×/day ≈ 60 min/month — well inside the free 2,000-minute allowance. It fires on
  schedule even when the API is asleep.
- The **API** then only serves **stateless reads** from Supabase (plus the
  occasional live OData fetch on a cache miss), so it's safe to run on a
  **scale-to-zero free host** like Render. Set `ENABLE_SYNC_SCHEDULER=false` there
  so the in-process APScheduler doesn't double-run the sync.
- The durable cache lives in the **`cache_entries` Postgres table**, not memory, so
  a cold start loses only the in-memory optimization layer — not the cached data.

> **Why not Netlify Functions / InfinityFree for the API?** Netlify Functions can't
> own a 6h scheduler and lose the in-memory layer per cold start (we mitigate the
> latter, but the scheduler is the real blocker — hence GitHub Actions).
> InfinityFree (and similar free shared hosting) is **PHP + MySQL only** — it can't
> run Node or Python at all, so it's a non-starter for this stack.

> **Cold-start note:** Render free spins the API down after ~15 min idle; the next
> request waits ~50s while it wakes. Fine for this traffic level. If that latency
> ever bothers you, Fly.io/Koyeb behave similarly, or a ~$5/mo always-on instance
> removes it.

---

## 0. Prerequisites

- A GitHub account with this repo pushed to a remote.
- Free accounts on: [Supabase](https://supabase.com), [Render](https://render.com), [Netlify](https://app.netlify.com).
- Local: `pnpm`, Python 3.11+, and (optional) the [Netlify CLI](https://docs.netlify.com/cli/get-started/) — `npm i -g netlify-cli`.

---

## 1. Supabase: create the database

1. **Create project**: Supabase dashboard → *New project*. Pick a region close to where Render will host the API (Frankfurt and Ireland are both fine). Record the *database password* you set — there's no way to recover it later.
2. **Get the connection string**: *Project settings → Database → Connection string*. Use the **"Session pooler"** string (port `5432`), **not** the Transaction pooler (6543) and not the direct connection. This app holds a persistent SQLAlchemy/asyncpg pool; asyncpg's prepared statements break under pgBouncer *transaction* mode, so session mode is required. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@<region>.pooler.supabase.com:5432/postgres
   ```
3. **Convert it for asyncpg**: swap the driver prefix and append SSL (URL-encode special chars in the password — `@`→`%40`, etc.):
   ```
   postgresql+asyncpg://postgres.<project-ref>:<PASSWORD>@<region>.pooler.supabase.com:5432/postgres?ssl=require
   ```
   This is the `DATABASE_URL` you'll set on Render **and** the `SUPABASE_DATABASE_URL` GitHub Actions secret.

   > If you hit an SSL error from asyncpg, drop `?ssl=require` — asyncpg negotiates SSL with Supabase automatically in most environments. If you instead see `prepared statement ... does not exist`, you're on the transaction pooler (6543) — switch to 5432.
4. **Get the project URL + anon/service keys**: *Project settings → API*. You won't use these unless you later swap from the FastAPI client to direct Supabase SDK access — store them anyway, they're handy.

### Create the schema

The schema is defined as Alembic migrations under `apps/api/alembic/versions/`. You don't need to paste hand-written SQL.

From your local machine, with the Python venv active:

```powershell
cd apps\api
# Override DATABASE_URL for this one command — the migration runs against Supabase.
$env:DATABASE_URL = "postgresql+asyncpg://postgres.<ref>:<PASSWORD>@<region>.pooler.supabase.com:5432/postgres?ssl=require"
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
   | `ENABLE_SYNC_SCHEDULER`          | `false` — GitHub Actions owns the sync (see step 4)           |
   | `OKNESSET_KNESSET_FILTER`        | `25` — restricts sync to current Knesset, fits free tier      |
   | `LOG_LEVEL`                      | `INFO`                                                        |

   > `ENABLE_SYNC_SCHEDULER=false` is important: it stops the in-process APScheduler
   > so the sync isn't run twice (and so a sleeping API never silently misses it).

4. Deploy. After it boots, hit `https://<your-render-app>.onrender.com/api/v1/health` — it should return `{"status":"ok","env":"production"}`. The DB will be empty until the first sync runs (next section).

---

## 3. GitHub Actions: the data sync

The workflow is already committed at `.github/workflows/sync.yml`. It runs
`run_sync()` every 6 hours against Supabase, filtered to Knesset 25.

1. **Add the secret**: GitHub repo → *Settings → Secrets and variables → Actions → New repository secret*:
   - **Name**: `SUPABASE_DATABASE_URL`
   - **Value**: your Supabase asyncpg string (same as Render's `DATABASE_URL`, including `?ssl=require`)
2. **Run it once now** to populate the empty tables: repo → *Actions* tab → *Knesset data sync* → *Run workflow*. It finishes in ~1–2 min.
3. Confirm in *Supabase → Table editor* that `vote_decisions` etc. now have rows (~10K vote_decisions for K25, vs. 1.27 M unfiltered).

After this, the cron keeps the data fresh on its own. You can also trigger a sync manually any time from the Actions tab.

> Want to sync from your own machine instead (e.g. before the repo is on GitHub)?
> ```powershell
> cd apps\api
> $env:DATABASE_URL = "postgresql+asyncpg://postgres.<ref>:<PASSWORD>@<region>.pooler.supabase.com:5432/postgres?ssl=require"
> $env:OKNESSET_KNESSET_FILTER = "25"
> python -c "import asyncio; from app.tasks.sync import run_sync; asyncio.run(run_sync())"
> ```

---

## 5. Netlify: host the frontend

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

## 6. Test locally first (recommended)

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

## 7. Full env-var inventory

Anything with a real value lives only in dashboards / `.env` (gitignored). The template is `.env.example` at the repo root.

**Render (API)**

- `APP_ENV` — `production`
- `DATABASE_URL` — Supabase asyncpg URL with `?ssl=require`
- `ALLOWED_ORIGINS` — comma-separated, includes your Netlify URL
- `ENABLE_SYNC_SCHEDULER` — `false` (GitHub Actions owns the sync)
- `OKNESSET_KNESSET_FILTER` — `25` to fit Supabase free tier
- `LOG_LEVEL` — `INFO`
- `DATABASE_POOL_SIZE`, `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_SEARCH` — defaults are fine

**GitHub Actions (sync)**

- `SUPABASE_DATABASE_URL` *(repo secret)* — same asyncpg URL as Render's `DATABASE_URL`
- `OKNESSET_KNESSET_FILTER` is hard-set to `25` inside the workflow

**Netlify (web)**

- `NEXT_PUBLIC_API_URL` — Render URL
- `NEXT_PUBLIC_ENABLE_ANALYTICS` — `false`

**Local only**

- `apps/api/.env` — your local Postgres + Redis URLs (already set per CLAUDE.md); `ENABLE_SYNC_SCHEDULER=true`
- `apps/web/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:8000`

---

## 8. Things to watch after deploy

- **First Render boot** can take ~50–60s on the free tier (cold start) after ~15 min idle. Subsequent requests are fast.
- **The sync runs in GitHub Actions, not the API.** Keep `ENABLE_SYNC_SCHEDULER=false` on Render so it doesn't double-run. The sync is idempotent (UPSERT / `ON CONFLICT DO NOTHING`), so a manual re-run or an overlapping cron is harmless.
- **Supabase free tier limits**: 500 MB database, 2 GB egress / month. The Knesset-25 subset stays well under both, but if you ever drop `OKNESSET_KNESSET_FILTER` you'll blow through the 500 MB cap on `vote_decisions` alone.
- **In-memory cache vanishes on every Render restart**. That's fine — the durable cache lives in the `cache_entries` Postgres table; only the in-memory optimization layer is lost, and it refills on the first request after wake.
