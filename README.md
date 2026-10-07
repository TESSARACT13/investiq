# INVESTIQ

INVESTIQ is a Next.js frontend with a FastAPI market-data backend. The advisor and Quant Lab provide explainable rules-based market signals; the trading screens currently execute **paper trades only**. They are not connected to a brokerage account and cannot place real-money orders.

## Run locally

Requirements: Node.js 20+, Python 3.11+, and an Upstox access token for live quotes, historical charts, and streaming. Without a token, the frontend and paper-trading flows still run, but the backend may use clearly identified demo fallback quotes and cannot load real chart history.

1. Start the backend in one terminal:

   ```sh
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
   pip install -r requirements.txt
   cp .env.example .env
   # Set UPSTOX_ACCESS_TOKEN in backend/.env to enable live Upstox data.
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

2. Start the frontend in another terminal:

   ```sh
   cd frontend
   npm ci
   cp .env.example .env.local
   npm run dev
   ```

3. Open <http://localhost:3000>. The backend health check is <http://127.0.0.1:8000/health>.

`NEXT_PUBLIC_API_URL` is the browser-facing FastAPI base URL. In production it must be the public HTTPS URL for the API. Set `CORS_ORIGINS` on the backend to include the frontend's exact deployed origin. Keep Upstox credentials on the backend; never put them in a `NEXT_PUBLIC_` variable.

## Supabase accounts and saved data

1. In your Supabase project, open **Project Settings → API** (or **Connect**) and copy the Project URL and the **publishable** key. A legacy `anon` public key also works. Do not use a `secret` or `service_role` key in the browser.
2. Add these values to `frontend/.env.local`, preserving the existing `NEXT_PUBLIC_API_URL` setting:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

3. Open the Supabase **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql). It creates the profile, paper wallet, holdings, order history, watchlist, and SIP-plan tables; turns on per-user row-level security; and installs the atomic paper-order function.
4. Under **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/verify` and `http://localhost:3000/login` to the allowed redirect URLs. Add the deployed app URL there when the public site is ready.
5. Restart the frontend after editing `.env.local`, then visit `/signup` to create an account. Sign-up follows your Supabase email-confirmation setting.

Before the environment variables and SQL are configured, the app remains in local demo mode. Demo trades and SIP plans stay in that browser; signed-in data is stored per user in Supabase. SIP plans are trackers only and do not automatically debit money or place broker orders. New stock symbols are added to the curated NSE equity universe where Upstox has a matching instrument.

## Production build

```sh
cd frontend
npm ci
npm run build
npm run start
```

For a separate deployment, deploy the `frontend` directory as a Next.js app and run `backend` as a persistent Python service. The live chart and websocket features require the backend service to remain reachable. Configure both environment variables in the hosting provider before deployment.

## GitHub

This checkout uses `https://github.com/TESSARACT13/investiq.git` as its GitHub remote. To authenticate on macOS, install GitHub CLI with `brew install gh`, then run `gh auth login` and choose GitHub.com, HTTPS, and browser sign-in. Confirm with `gh auth status`; then push with `git push -u origin main`. Never paste access tokens into chat or commit `.env`, `.env.local`, or credentials.

## Publish a shareable website

Deploy the `backend` directory as a Render Web Service (build: `pip install -r requirements.txt`; start: `uvicorn main:app --host 0.0.0.0 --port $PORT`). Set `UPSTOX_ACCESS_TOKEN` as a private Render environment variable and set `CORS_ORIGINS` to the exact Vercel frontend origin. Deploy the `frontend` directory to Vercel as a Next.js project and set `NEXT_PUBLIC_API_URL` to the Render HTTPS service URL. Redeploy the frontend after setting that URL; then share its Vercel URL. Keep the Upstox token only in Render's private environment settings.
