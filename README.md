# AssuredGig Backend

Platform services for the AssuredGig / AssuredCrew worker app. NestJS (Fastify) ·
TypeScript strict · Prisma · PostgreSQL 17 · Redis/Valkey + BullMQ.

Built to **Backend TRD v0.1** (`assuredgig_backend_trd_mvp.md` — not yet
committed to this repo; drop it in `docs/` so the section references below
resolve). The TRD is the reference for *why* anything here is shaped the way
it is.

## Prerequisites

- **Node 24 LTS** — pinned in [.nvmrc](.nvmrc) (v24.19.0). With nvm: `nvm use`.
- **Postgres 17 and Redis** — already installed and running locally. This machine
  has no container runtime, so rather than `docker compose up`, the services run
  from userspace binaries under `~/.local`. Manage them with
  [scripts/dev-services.sh](scripts/dev-services.sh).

```bash
./scripts/dev-services.sh start    # postgres :5432 · redis :6379
./scripts/dev-services.sh status
./scripts/dev-services.sh stop
```

Redis 7.4.2 stands in for the Valkey named in
[docker-compose.yml](docker-compose.yml); they are protocol-compatible and BullMQ
cannot tell them apart. The compose file remains the reference for CI and
production, where containers are available.

## Getting started

```bash
cp .env.example .env             # fill in secrets; thresholds do NOT go here
npm install
./scripts/dev-services.sh start
npx prisma migrate deploy        # schema is already migrated locally
npm run db:seed                  # 26 config keys + 4 feature flags + first ops admin
npm run start:dev
```

- API: `http://localhost:3000/v1`
- OpenAPI: `http://localhost:3000/docs` (JSON at `/docs/openapi.json`)
- Health: `/v1/healthz`, `/v1/readyz`

### Ops console accounts

Ops users sign in with email and password; there is no self-sign-up.

1. Set `OPS_ADMIN_EMAIL` and `OPS_ADMIN_PASSWORD` (12–128 chars) in `.env`, then
   run `npm run db:seed`. It creates that ADMIN once and never touches it again.
2. The admin signs in at `POST /v1/ops/auth/login` and manages everyone else:

| Endpoint | Does |
|---|---|
| `POST /v1/ops/auth/login` | `{ email, password }` → access + refresh token |
| `POST /v1/ops/auth/refresh` | `{ refreshToken }` → rotated pair (7-day sessions) |
| `POST /v1/ops/auth/logout` | Ends every session for the caller |
| `POST /v1/ops/users` | ADMIN: `{ email, password, role? }`, role defaults to `OPS` |
| `PATCH /v1/ops/users/:id` | ADMIN: `{ role?, disabled? }`; disabling ends their sessions |
| `POST /v1/ops/users/:id/password` | ADMIN: `{ password }`; ends their sessions |

An admin cannot change their own role or status, so there is always at least one
active admin. Role and disabled state are read from the database on every admin
request, so a change takes effect immediately rather than when a token expires.
Passwords are hashed with scrypt (`src/shared/auth/password.ts`).

`/v1` comes from URI versioning alone — **do not also call
`setGlobalPrefix('v1')`**, or every route mounts at `/v1/v1/...`. All app
configuration lives in [src/bootstrap.ts](src/bootstrap.ts), which `main.ts` and
the e2e suite both call so tests can never validate a differently-configured app.

### The seat-uniqueness index

The initial migration already carries it. When regenerating migrations from
scratch, run `prisma migrate dev --create-only` and append
[`prisma/manual/001_seat_hold_unique.sql`](prisma/manual/001_seat_hold_unique.sql)
before applying. It creates the **partial** unique index that makes "one seat,
one worker" a database invariant — Prisma cannot express a partial index in
schema, and without it concurrent acceptance of the same seat produces two
bookings. Keep that file outside `prisma/migrations/`; Prisma treats every
subdirectory there as a migration and fails with `P3015`.

## Layout

```
src/
  shared/          idempotency · geo · time arbitration · errors · guards
  config/          thresholds and flags as data (§12)
  queue/           BullMQ queues, Redis client, stable job ids (§10)
  prisma/          PrismaService
  auth/            otp, sessions, tokens, device binding (§7)
  workers/ companies/ requirements/
  bookings/        state machine + append-only event log (§5)
  attendance/      the validation pipeline (§8)
  confirmations/ reliability/ notifications/ disputes/ media/ ops/
  health/
prisma/            schema, seed, manual migration SQL
test/              e2e
```

Modules talk through services, never by reaching into each other's Prisma
models. `bookings` is the only module permitted to write booking state.

## What is implemented vs. scaffolded

**Implemented** — the correctness spine, the parts that are expensive to retrofit:

| Area | File |
|---|---|
| Error contract, stable machine codes | [src/shared/errors/](src/shared/errors/) |
| Idempotency (claim / replay / key-reuse) | [src/shared/idempotency/](src/shared/idempotency/) |
| Time arbitration + tests | [src/shared/time/](src/shared/time/) |
| Haversine geo + implied-speed signal | [src/shared/geo/geo.service.ts](src/shared/geo/geo.service.ts) |
| Booking state machine + exhaustive tests | [src/bookings/booking-state-machine.ts](src/bookings/booking-state-machine.ts) |
| Transition writer (projection + event, one transaction) | [src/bookings/bookings.service.ts](src/bookings/bookings.service.ts) |
| Attendance pipeline: 9 stages, accumulating verdicts | [src/attendance/pipeline/](src/attendance/pipeline/) |
| Config service: DB-backed, Redis-cached, audited | [src/config/config.service.ts](src/config/config.service.ts) |
| Presigned R2 uploads | [src/media/media.service.ts](src/media/media.service.ts) |
| OTP sign-in, rotating device-bound sessions | [src/auth/](src/auth/) |
| Worker profile: read, step-wise update | [src/workers/](src/workers/) |
| Full data model | [prisma/schema.prisma](prisma/schema.prisma) |

**Scaffolded** — module shells carrying a docblock of what belongs in them:
`companies`, `requirements`, `confirmations`, `reliability`, `notifications`,
`disputes`, `ops`. No controllers or DTOs for those yet, and no BullMQ
processors — the queues and job ids are declared in
[src/queue/queue.constants.ts](src/queue/queue.constants.ts), the processors are not written.

Two pipeline stages have `TODO` bodies that need an external decision before they
can be finished: media HEAD-check against R2, and face verification (**BT-2** —
provider choice, which also decides whether biometric data leaves the country).

### Authentication

The API is **fail-closed**. `JwtAuthGuard` and `RolesGuard` are both registered
as `APP_GUARD` in [src/auth/auth.module.ts](src/auth/auth.module.ts) and run in
that order: the first establishes identity, the second decides whether the
endpoint accepts it. A new controller is therefore protected whether or not its
author remembered to think about it, and opting out takes an explicit
`@Public()` — currently only health.

Worker sign-in is OTP over phone:

```
POST /v1/auth/otp/request   { phone }                       → public, rate-limited
POST /v1/auth/otp/verify    { phone, code, deviceId }       → public, creates the worker
POST /v1/auth/refresh       { refreshToken, deviceId }      → public, rotates
POST /v1/auth/logout                                        → worker
GET  /v1/workers/me                                         → worker
PATCH /v1/workers/me                                        → worker, @Idempotent()
```

OTP codes are stored as a **peppered HMAC**, never a plain digest: six digits is
a millon possibilities, so an unkeyed hash of a stolen table is reversible in
seconds. Refresh tokens are opaque, hashed at rest, device-bound and rotating;
presenting an already-rotated token revokes the entire family, because a replay
means the token leaked.

No MSG91 credentials exist yet, so `LoggingOtpSender` writes the code to the log
instead of sending it — and **refuses to run when `NODE_ENV=production`**, since
a silent no-op sender there would lock every worker out with no visible failure.

## Invariants worth not breaking

1. **Never trust a client verdict.** The client's geofence opinion is stored as
   a flag when it disagrees with the server; it never decides anything.
2. **Every write is idempotent.** Mark write endpoints `@Idempotent()`; the
   unique constraint, not application logic, is what makes duplicates safe.
3. **State transitions are append-only.** A status without a matching
   `BookingEvent` is a corrupt audit trail. Only `BookingsService.transition()`
   writes booking state.
4. **Server time is the only trusted clock.** Device time is evidence.
5. **No threshold is a constant.** If you are about to write a number, it
   belongs in [src/config/config-keys.ts](src/config/config-keys.ts) as a seed
   default and in the `config` table as truth.
6. **Verdict and flags are separate.** Accepted-with-three-flags is a real
   outcome, not a contradiction.

## Tests

```bash
npm test              # unit  — 17 tests
npm run test:e2e      # e2e   — 22 tests; needs services running
```

The concurrency tests named in TRD §15 — one seat under concurrent acceptance,
duplicate check-in submission, offline check-in landing at capture time, no-show
firing exactly once — are **not yet written**. They are the tests that protect
the reliability data from irrecoverable corruption; write them alongside the
endpoints they cover.

## Open technical items carried into the code

| # | Item | Where it surfaces |
|---|---|---|
| BT-1 | Reliability formula | `RELIABILITY_FORMULA_VERSION` — versioned from day one |
| BT-2 | Face verification provider | `FaceVerificationStage`, flag-only today |
| BT-3 | Time-skew tolerance | `TIME_SKEW_TOLERANCE_MS`, seeded permissive at 5 min |
| BT-4 | Media retention window | `ATTENDANCE_MEDIA_RETENTION_DAYS`, seeded 90 |
| BT-5 | Postgres 17 vs 18 | `docker-compose.yml`, CI service image |
| BT-6 | Visibility / browse / documents flags | `FLAG_DEFAULTS`, all off |
| BT-7 | OTP rate limits | `OTP_MAX_*` config keys |
