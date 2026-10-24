# PHASE 03 – Authentication, accounts, staff, restaurant profile

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` sections 3.2, 3.3, 3.4.1, 3.5 (`/auth/login`), 3.8; `docs/01_SRS.md` FR-01..FR-05, UC-01, NFR-S1..S8; `DECISIONS.md` D-2, D-4.

## Goal
Complete Process 1.0: all endpoints in section 3.4.1.

## Endpoints (exact paths, methods, status codes from the doc)
`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /me`, `GET/POST /staff`, `PATCH/DELETE /staff/{id}`, `GET/PATCH /restaurant`.

## Rules
- Register creates the restaurant (unique slug from the name) and the owner in one transaction. Password policy: at least 8 characters, must contain a letter and a number.
- Login: bcrypt compare; on failure increment `failed_attempts`; at 5 failures set `locked_until = now() + 15 min` and return `423 ACCOUNT_LOCKED`; success resets the counter. Return `401 INVALID_CREDENTIALS` with a generic message (no user enumeration).
- Access token: 60 minutes, claims `sub`, `restaurantId`, `role`. Refresh token: 7 days, HttpOnly + Secure + SameSite=Lax cookie (Secure may be off in development only).
- Forgot-password always returns `202` (even for unknown emails). Reset token: random 32 bytes, store SHA-256 in `password_reset_tokens`, expires in 30 minutes, single use; resetting also clears the lockout. Send the link through the `Mailer` interface (console in development).
- Middleware: `authenticate`, `requireRole('owner' | 'kitchen')`. Kitchen accounts can only be created by the owner. Owners cannot delete themselves.
- Rate limits per `AGENTS.md`.
- Add zod request schemas to `packages/shared`.

## Tests (name them with requirement IDs)
Register/login happy paths; duplicate email -> 409; wrong password; lockout after 5 failures and unlock after 15 minutes (use fake timers or an injectable clock); expired/used reset token; refresh flow; role enforcement (kitchen cannot call owner endpoints); a user from restaurant A cannot read or change staff of restaurant B (404).

## Acceptance criteria
All endpoints match section 3.4.1, error codes match section 3.3, tests pass, coverage of the auth services is at least 80%.
