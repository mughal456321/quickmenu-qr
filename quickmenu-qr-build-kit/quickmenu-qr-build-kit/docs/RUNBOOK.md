# Runbook — QuickMenu QR

Operational procedures for staging and production. Written for the pilot team
(two engineers, one on-call). Keep this file next to `render.yaml` and update it
after every incident.

## 1. Topology

| Component | Host | Notes |
|---|---|---|
| Web (Next.js) | Vercel, project root `quickmenu-qr-build-kit/quickmenu-qr-build-kit/apps/web` | Environment `NEXT_PUBLIC_API_URL` |
| API (Express + Socket.IO) | Render web service from `render.yaml` | Health check `/api/v1/health`, WebSocket path `/ws` |
| Database | Render managed PostgreSQL, same region as the API | Daily backups |
| Media | Cloudinary (signed uploads) | Folder `quickmenu/{restaurantId}` |
| DNS / WAF / TLS | Cloudflare in front of Vercel and Render | Full (strict) TLS |
| Uptime | UptimeRobot on `/api/v1/health` | 1-minute interval, email/SMS alert |
| Errors | Sentry (web and API) | `SENTRY_DSN` |

Canonical hostnames (replace with the real ones after the first deploy):

- `https://app.<domain>` → Vercel
- `https://api.<domain>` → Render
- `wss://api.<domain>/ws` → Socket.IO

## 2. Environment variables

Never commit real values. `.env.example` is the template; Render and Vercel hold
the secrets.

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `NODE_ENV` | API | yes | `staging` or `production` |
| `PORT` | API | Render sets it | HTTP port |
| `DATABASE_URL` | API | yes | PostgreSQL connection string |
| `DB_POOL_MAX` | API | no (default 20) | Pool size; 50 for the pilot |
| `JWT_ACCESS_SECRET` | API | yes | ≥ 32 random chars |
| `JWT_REFRESH_SECRET` | API | yes | ≥ 32 random chars, different from access |
| `TRACKING_SECRET` | API | yes | ≥ 32 random chars |
| `FRONTEND_ORIGIN` | API | yes | Comma-separated allow-list, e.g. `https://app.<domain>` |
| `PUBLIC_MENU_BASE_URL` | API | yes | `https://app.<domain>/m` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | API | yes for photos | Leave empty to use the fake storage in local/dev |
| `TRANSLATION_PROVIDER` | API | no | `fake`, `libretranslate`, `google` |
| `TRANSLATION_API_KEY` | API | for Google/LibreTranslate | Provider key |
| `MAIL_TRANSPORT` | API | no | `console` or `smtp` |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` | API | when `MAIL_TRANSPORT=smtp` | Password-reset mail |
| `SENTRY_DSN` | API | recommended | Error reporting |
| `REDIS_URL` | API | no | Reserved; not required for a single instance |
| `NEXT_PUBLIC_API_URL` | Web | yes | `https://api.<domain>/api/v1` |

## 3. First deployment

1. **Database.** Create a Render PostgreSQL instance in the same region as the
   API. Copy the internal connection string into `DATABASE_URL` for both the
   staging and production services. They must be separate databases.
2. **API.** In Render, *New → Blueprint*, point at the repository that contains
   `render.yaml`. Approve the service. Render builds
   `npm ci && npm run build:shared && npm run build:api`, runs
   `npm run db:migrate` as the pre-deploy step, then starts
   `node apps/api/dist/server.js`.
3. **Secrets.** Fill every variable from §2 in the Render dashboard before the
   first successful health check. Generate secrets with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
4. **Web.** In Vercel, import the repository, set **Root Directory** to
   `quickmenu-qr-build-kit/quickmenu-qr-build-kit/apps/web`, framework Next.js,
   and add `NEXT_PUBLIC_API_URL`. Deploy.
5. **CORS.** Set `FRONTEND_ORIGIN` to the Vercel production and preview domains
   (comma-separated) and redeploy the API.
6. **Cloudflare.** Add `app` and `api` CNAMEs, TLS mode *Full (strict)*, enable
   HSTS. WebSockets are proxied by default.
7. **Smoke test.** Run the checklist in §5, then place one real order from a
   phone on the pilot Wi-Fi.
8. **Monitoring.** Add the UptimeRobot monitor, confirm a Sentry test event, and
   check that the Render daily backup is enabled.

### Migration policy

Migrations are plain SQL in `db/migrations/` and run automatically as Render's
pre-deploy step. They are additive and idempotent (`schema_migrations` tracks
what has run). Never edit a migration that has already run in staging or
production; add a new numbered file instead.

## 4. Release process

```
feature branch → PR → CI (lint, typecheck, api/shared/web tests, build) → merge to main
main → Vercel preview + Render staging deploy (automatic)
staging smoke test → manual promotion to production (Render “Deploy”, Vercel “Promote”)
```

Production promotion is always manual. Do not promote on a Friday evening or
during lunch/dinner service.

### Pre-deploy checklist

- [ ] CI green on `main`.
- [ ] `npm run test:e2e` green locally or against staging.
- [ ] New migrations reviewed; a rollback statement exists in the PR.
- [ ] `docs/NFR_RESULTS.md` / `README.md` updated if behaviour changed.
- [ ] No new secret committed (`git diff` review).
- [ ] Staging order flow works from a phone.

### Post-deploy checklist

- [ ] `GET /api/v1/health` returns `{ "data": { "status": "ok", "db": "up" } }`.
- [ ] `GET /api/v1/public/languages` returns five languages.
- [ ] Login as owner and as kitchen.
- [ ] Place an order; the KOT card appears in under 2 s.
- [ ] Advance the order to served; the customer page updates.
- [ ] `https://api.<domain>/ws` handshake succeeds (browser console: no CORS error).

## 5. Rollback

**Web (Vercel).** *Deployments → previous deployment → Promote to Production.*
Takes seconds; no database change.

**API (Render).** *Events → previous successful deploy → Rollback.* Or redeploy
the previous commit. Because migrations are additive, an older API can run
against the newer schema as long as the migration only added columns/tables. If a
migration was destructive, restore the database instead (§6).

**Database.** Point-in-time recovery on the managed instance, or restore the
latest daily backup to a new instance, verify it, then switch `DATABASE_URL`.
A destructive migration requires a maintenance window: put the web app in a
"menu unavailable" state only if the API is also down; otherwise the 5 s menu
cache and read-only endpoints keep working.

**Feature flags.** There is no flag service. The kill switches are the
environment variables (`TRANSLATION_PROVIDER=fake` to stop provider calls,
empty Cloudinary variables to fall back to the fake storage in non-production).

## 6. Backup and restore drill (NFR-R2)

Render takes a daily backup. RPO is 24 h by default; confirm the schedule in the
dashboard. RTO target is 4 h.

1. Create a new PostgreSQL instance from the latest backup.
2. Copy its connection string into a temporary API instance
   (`DATABASE_URL=…`, `NODE_ENV=staging`).
3. Run `curl https://temp-api/api/v1/health` and log in as the demo owner.
4. Place an order and confirm the row exists:
   `SELECT count(*) FROM orders;`
5. Record the elapsed time from step 1 to step 4 in this file.
6. Destroy the temporary instance.

| Drill date | Backup age | Restore time | Verified by |
|---|---|---|---|
| _(pending first cloud deployment)_ | | | |

## 7. Load test on staging

```bash
# 1. Pick an active table and an available item.
curl -s https://api.<domain>/api/v1/public/menu/<qrToken> | jq '.data.categories[0].items[0].id'

# 2. Run k6 (500 VUs, p95/p99 thresholds enforced).
k6 run load/k6.js \
  -e BASE_URL=https://api.<domain> \
  -e QR_TOKEN=<qrToken> \
  -e ITEM_ID=<itemId>
```

Thresholds fail the run when p95 > 300 ms, p99 > 800 ms, or errors > 1%. Save
the summary next to `docs/NFR_LOAD_RESULTS.json` and update
`docs/NFR_RESULTS.md`. Note: the per-IP limits are intentionally bypassed in
`k6.js` with `X-Forwarded-For`; production keeps `trust proxy = 1` so the real
client IP is used.

## 8. Rotating secrets

1. Generate a new value.
2. Update it in Render (API) or Vercel (web) **and** in the password manager.
3. Redeploy the API.
4. Rotating `JWT_ACCESS_SECRET` logs everyone out within 60 minutes.
   Rotating `JWT_REFRESH_SECRET` invalidates refresh cookies immediately;
   rotating `TRACKING_SECRET` invalidates existing customer tracking links
   (customers must rescan the table QR code). Announce this before rotating
   during service.
5. Rotate Cloudinary and SMTP credentials in their consoles first, then in
   Render.
6. Revoke the old values in the provider console.
7. Never rotate more than one secret class at a time; run the smoke test after
   each.

## 9. Kitchen screen is offline

Symptoms: the board shows **Reconnecting…**, cards stop moving, the customer
page still works.

1. **Do not restart the API first.** The socket reconnects automatically and
   `kot:sync` restores the board; while offline the board polls every 5 s.
2. Confirm the API is healthy: `GET /api/v1/health`. If it is down, follow §5.
3. Check the tablet: Wi-Fi, screen wake lock, battery, browser tab still open.
   Reload the page; the board reloads the active orders from `GET /orders`.
4. If only the kitchen tablet is affected, open `/kitchen` on a phone or another
   tablet and log in with the kitchen account.
5. If the API is up but sockets fail, check Cloudflare/Render for blocked
   WebSocket upgrades and `FRONTEND_ORIGIN` (CORS).
6. Paper fallback: read the last visible tickets from the board, write new ones
   on paper, and reconcile with `GET /orders` when the screen returns.

## 10. Common incidents

| Symptom | Likely cause | Action |
|---|---|---|
| `429 RATE_LIMITED` for everyone | Reverse proxy not forwarding the client IP, so every request shares one bucket | Set `trust proxy` correctly and confirm `X-Forwarded-For` at the edge |
| `401` right after login | Access secret rotated or clock skew | Redeploy, re-login |
| `423 ACCOUNT_LOCKED` | Five failed logins | Wait 15 minutes or reset the password as owner |
| Menu shows old prices | 5 s cache plus browser cache | Wait 5 s; owner writes invalidate the restaurant namespace |
| QR code opens a 404 | Table deleted or token rotated | Re-download the QR from `/dashboard/tables` |
| Images missing | Cloudinary variables empty or asset deleted | Check `CLOUDINARY_*`; re-upload |
| Translation falls back to English | Provider timeout or missing key | Expected graceful degradation; check `TRANSLATION_PROVIDER` and logs |
| Orders duplicate | Client retried without the same `Idempotency-Key` | The API deduplicates by key; fix the client retry to reuse it |
| Database connections exhausted | `DB_POOL_MAX` × instances > plan limit | Lower the pool or upgrade the instance |

## 11. Logs and alerts

- **API logs:** Render log stream, structured JSON (`pino`). Every request has
  `X-Request-Id`; search by it when a customer reports an error.
- **Sentry:** group by release; the request id is attached to API events.
- **UptimeRobot:** one monitor, 1-minute interval, two alert contacts.
- **Disk/DB:** Render alerts for storage and connection limits.

Escalation for the pilot: on-call engineer → project lead → hosting support. If
the database is unavailable for more than 15 minutes during service, switch the
web app to a static "menu temporarily unavailable" notice and take orders on
paper.

## 12. Onboarding and offboarding a restaurant

Onboarding is the same flow the owner uses: register, build the menu, add
tables, print QR codes. See `docs/PILOT_KIT.md` §2. Offboarding: export the
orders with a `SELECT` for the pilot report, then deactivate the tables and the
users. Do not delete the restaurant during the pilot; the data is needed for the
evaluation.
