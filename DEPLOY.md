# Deploying Latte

Frontend → Vercel (already set up). Backend + database → Render.

---

## 1. Backend on Render (via `render.yaml`)

1. Push `main` (this repo already contains `render.yaml`).
2. Render dashboard → **New → Blueprint** → connect `github.com/ArmouredOre/Latte`.
3. Render reads `render.yaml` and proposes: a **web service** `latte-api` (free) and a
   **Postgres** `latte-db` (free). Approve.
4. It will ask for the two `sync: false` values:
   - `GOOGLE_CLIENT_ID` — the same client ID used by the frontend
     (`437995674022-...apps.googleusercontent.com`).
   - `CORS_ORIGINS` — your frontend origin(s), comma-separated, no trailing slash,
     e.g. `https://latte-xyz.vercel.app`. Add `http://localhost:5173` too if you
     want the local frontend to talk to the deployed API.
   `JWT_SECRET` is generated automatically. `DATABASE_URL` is wired from `latte-db`.
5. First deploy runs `pip install -r requirements.txt` then
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Tables are created on startup.
6. When it's live, note the URL (e.g. `https://latte-api.onrender.com`) and check:
   `curl https://latte-api.onrender.com/api/health` → `{"status":"ok"}`.

### Using a non-Render database (optional, avoids the 30-day free-DB deletion)

Create a free Postgres on **Neon** or **Supabase**, then in `render.yaml`:
delete the `databases:` block and the `DATABASE_URL` `fromDatabase` entry, add
`DATABASE_URL` as another `sync: false` env var, and paste the external
connection string in the Render dashboard. No code changes — `postgres://` and
`postgresql://` are both accepted.

---

## 2. Point the frontend at the deployed API

In the **Vercel** project → Settings → Environment Variables (Production):

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://latte-api.onrender.com` (no trailing slash) |
| `VITE_GOOGLE_CLIENT_ID` | `437995674022-...apps.googleusercontent.com` |

Redeploy the frontend so the new env vars are baked into the build.

> `vite.config.js` has `base: '/Latte/'` (for GitHub Pages). If the Vercel site is
> served at the domain root, change it to `base: '/'` or the assets 404.

---

## 3. Google OAuth origins

Google Cloud Console → Credentials → the OAuth client → **Authorized JavaScript
origins** must list every origin the sign-in button loads on:

- `http://localhost:5173`
- `https://<your-app>.vercel.app` (production)
- any custom domain

(The Render API URL does **not** go here — the button never loads there.)

---

## 4. Known limitations of the free tier

- **Cold starts**: the free web service sleeps after ~15 min idle; the next
  request takes 30–60 s.
- **Free Postgres is deleted 30 days after creation.** Upgrade the DB to a paid
  plan, or use Neon/Supabase (see above).
- `/docs`, `/redoc`, `/openapi.json` are publicly reachable. To hide them, pass
  `docs_url=None, redoc_url=None, openapi_url=None` to `FastAPI(...)` in
  `app/main.py` when running in production.
- No rate limiting yet — consider adding it before real traffic.
