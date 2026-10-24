# Week 5 GitHub Setup and Error Playbook - QuickMenu QR

Current verified state: Phase 01, Phase 02, and Phase 03 are complete. The local repository is on `main` with 4 commits, 47 tests pass, and auth-service coverage is 96.11% statements.

Run all commands from:

```powershell
cd C:\Users\User\Desktop\QuickMenuQR\quickmenu-qr-build-kit\quickmenu-qr-build-kit
```

The repository is nested inside `quickmenu-qr-build-kit\quickmenu-qr-build-kit`. Running Git in `C:\Users\User\Desktop\QuickMenuQR` fails with "not a git repository".

## 1. Create the GitHub repository

GitHub CLI (`gh`) is not installed on this machine, so create the repository in the browser.

1. Open https://github.com/new
2. Repository name: `quickmenu-qr`
3. Choose Public or Private. On a free plan, branch protection may require a public repository.
4. Do **not** add a README, `.gitignore`, or license. The local repository already has them.
5. Click Create repository.

Then connect the local repository. Replace `<your-username>` with your GitHub username:

```powershell
git remote add origin https://github.com/<your-username>/quickmenu-qr.git
git push -u origin main
```

If a remote already exists:

```powershell
git remote set-url origin https://github.com/<your-username>/quickmenu-qr.git
git push -u origin main
```

The push starts the CI workflow automatically because `.github/workflows/ci.yml` runs on every branch.

### Option B: GitHub CLI

If you prefer the CLI:

```powershell
winget install --id GitHub.cli -e
gh auth login
gh repo create quickmenu-qr --public --source . --remote origin --push
```

## 2. Enable branch protection

On GitHub: **Settings -> Branches -> Add branch protection rule** (or **Settings -> Rules -> Rulesets**).

- Branch name pattern: `main`
- Enable **Require a pull request before merging**
- Enable **Require status checks to pass before merging**
- After the first CI run, select the `lint-typecheck-test` job
- Enable **Do not allow force pushes**
- Enable **Do not allow deletions**

Take a screenshot of this page for the report.

If the options are disabled, the repository is private on a free plan. Make it public or upgrade the plan.

## 3. Prove the pull-request and CI flow

```powershell
git checkout -b docs/week-5-evidence
git commit --allow-empty -m "docs: verify CI pipeline (Week 5)"
git push -u origin docs/week-5-evidence
```

Open the pull request on GitHub, wait for the `CI` workflow to pass, then merge it. Copy the Actions run URL into the report.

After merging:

```powershell
git checkout main
git pull
```

## 4. Verify locally before uploading

```powershell
docker compose up -d
docker compose ps
npm run db:migrate
npm run db:seed
npm run test
npm run test:coverage
npm run lint
npm run typecheck
npm run build
```

Expected:

- 47 tests passing (43 API + 4 shared)
- auth-service coverage 96.11% statements, 87.8% branches, 100% functions
- lint, typecheck, and all builds pass

Verify the health endpoint:

```powershell
npm run build:api
$p = Start-Process node -ArgumentList "dist/server.js" -WorkingDirectory "apps\api" -PassThru
Start-Sleep 4
Invoke-RestMethod http://localhost:4000/api/v1/health
Stop-Process -Id $p.Id -Force
```

Expected:

```json
{ "data": { "status": "ok", "db": "up" } }
```

## 5. Error playbook

| Error you see | Cause | Fix |
|---|---|---|
| `fatal: not a git repository` | You are in the parent folder | `cd quickmenu-qr-build-kit\quickmenu-qr-build-kit` |
| `docker: error during connect ... daemon is not running` | Docker Desktop is not started | `Start-Process "C:\Users\User\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"` then wait for `docker info` to succeed |
| `connect ECONNREFUSED ::1:5432` or `127.0.0.1:5432` | PostgreSQL is not running | `docker compose up -d`; `docker compose ps` |
| `port is already allocated` on 5432 | A native PostgreSQL service is running | `Stop-Service postgresql*`; or change the Compose port to `5433:5432` and update `DATABASE_URL` |
| `password authentication failed for user "quickmenu"` | `.env` credentials do not match the container | Use `postgres://quickmenu:quickmenu@localhost:5432/quickmenu` in `apps/api/.env` |
| `database "quickmenu_test" does not exist` | Test setup could not create it | Ensure the `quickmenu` user can create databases; or `docker compose exec db psql -U quickmenu -d postgres -c "CREATE DATABASE quickmenu_test;"` |
| `relation "restaurants" does not exist` | Migrations were not applied | `npm run db:migrate` |
| `Invalid environment variables` at start-up | Missing or short secrets | Copy `.env.example` to `apps/api/.env`; each JWT/tracking secret must be at least 32 characters |
| `EADDRINUSE :::4000` or `:::3000` | Another process uses the port | `Get-NetTCPConnection -LocalPort 4000` then `Stop-Process -Id <pid>`; or change `PORT` |
| `npm ci` fails in GitHub Actions | `package-lock.json` is out of sync | Run `npm install`, commit the lockfile, push |
| `git push` rejected: protected branch | Direct pushes to `main` are blocked | Push a feature branch and open a pull request |
| Branch protection options are disabled | Private repository on a free plan | Make the repository public, upgrade, or use Rulesets |
| `remote origin already exists` | A remote is already configured | `git remote set-url origin <url>` |
| LF/CRLF warnings | Windows line endings | Harmless. Optionally add `.gitattributes` with `* text=auto eol=lf` |
| `next build` fails after dependency changes | Stale `.next` cache | `Remove-Item -Recurse -Force apps\web\.next` then `npm run build:web` |
| Health returns `"db":"down"` | API cannot reach PostgreSQL | Check `docker compose ps`, `DATABASE_URL`, and migrations |
| `vitest --coverage` asks for a provider | Coverage package missing | `npm install -D @vitest/coverage-v8` in `apps/api`, then rerun |
| Claude artifact link is private or 404 | Sharing is off | Share -> anyone with the link; retest in a private window |
| Seed fails with duplicate slug | Seed was interrupted | Rerun `npm run db:seed`; if it persists, `npm run db:reset` then reseed |
| `permission denied for schema public` | Wrong database user | Use the `quickmenu` user from Compose |
| CI cannot create the test database | Postgres service user lacks CREATEDB | The `quickmenu` service user is the superuser; verify `TEST_DATABASE_URL` |
| `gh` is not recognized | GitHub CLI is not installed | Use the browser steps above, or `winget install --id GitHub.cli -e` |

## 6. Reset commands

Use only when the local database is disposable:

```powershell
npm run db:reset          # drops and recreates public tables, then migrates
npm run db:seed           # rebuilds Cafe Aroma
docker compose down -v    # deletes the Postgres volume (destructive)
```

## 7. If you get stuck

Send the exact command and the first 30 lines of the error, plus:

- The error code (`ECONNREFUSED`, `EADDRINUSE`, `401`, `423`, etc.)
- The folder where you ran the command
- `docker compose ps`
- `git status` and `git remote -v`
- Whether `npm run lint`, `npm run typecheck`, and `npm run test` pass individually
