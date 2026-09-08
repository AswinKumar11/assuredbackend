# Ops auth design

Date: 2026-09-08

## Problem

`OpsUser` exists in the schema (`email`, `passwordHash`, optional `totpSecret`,
`role: OpsRole`) and every ops-facing endpoint (e.g. `CompaniesController`) is
already gated with `@Roles('ops')`. But nothing issues an `ops`-role JWT: the
only login flow in `src/auth` is the worker phone-OTP flow. No principal can
currently reach an ops-gated endpoint through the API.

This spec adds a login/session flow for `OpsUser` so an ops-gated endpoint
becomes reachable.

## Non-goals

- **TOTP enrollment.** Login verifies a TOTP code when `totpSecret` is already
  set, but nothing in this design sets it. Until an enrollment endpoint
  exists, `totpSecret` is populated by hand (seed data / direct DB write) for
  accounts that want a second factor.
- **Ops user provisioning API.** `OpsUser` rows are created by the seed
  script only. An admin-facing "create ops teammate" endpoint is a separate
  feature.
- **Fine-grained authorization by `OpsRole`.** `RolesGuard` only checks the
  coarse `ApiRole` (`'worker' | 'ops'`). `ADMIN` / `OPS` / `READ_ONLY` remain
  stored on `OpsUser` but unread by any guard — every ops user is equally
  authorized to every `@Roles('ops')` endpoint until a later design adds
  that check.

## Architecture

New files under the existing `src/auth/` folder — this stays the auth
domain and reuses `AuthModule`'s `JwtModule` registration and the two
globally-registered guards (`JwtAuthGuard`, `RolesGuard`) rather than
standing up a second module with its own JWT config:

- `ops-token.service.ts` — `OpsTokenService`. Session issuance/rotation/
  revocation for ops users.
- `ops-auth.service.ts` — `OpsAuthService`. `login`, `refresh`, `logout`.
- `ops-auth.controller.ts` — `OpsAuthController`, routes under `auth/ops/*`.
- `dto/ops-auth.dto.ts` — `OpsLoginDto`, `OpsRefreshDto`, `OpsLoginResponse`.

`OpsTokenService` is a separate service from the worker `TokenService`,
not a generalization of it. Two reasons:

1. The `RefreshToken` table is FK'd to `Worker` (`workerId` required,
   `onDelete: Cascade`) and carries a required `deviceId` for device
   binding. Ops sessions have neither a device to bind to (this is a web
   console, not the mobile app) nor a reason to touch that table's
   constraints.
2. Worker and ops sessions have different lifecycle rules already (device
   binding vs none). Branching one service on "which kind of session is
   this" reads worse than two small services that each do one thing.

Both are registered as providers/controller on the existing `AuthModule`
(alongside `AuthService`/`TokenService`), so `JwtModule` is configured once.

## Data model

New Prisma model, mirroring `RefreshToken` minus device binding:

```prisma
model OpsRefreshToken {
  id            String    @id @default(uuid()) @db.Uuid
  opsUserId     String    @db.Uuid
  familyId      String    @db.Uuid
  tokenHash     String    @unique
  replacedById  String?   @db.Uuid
  revokedAt     DateTime?
  revokedReason String?
  expiresAt     DateTime
  createdAt     DateTime  @default(now())

  opsUser OpsUser @relation(fields: [opsUserId], references: [id], onDelete: Cascade)

  @@index([opsUserId, familyId])
  @@map("ops_refresh_tokens")
}
```

`OpsUser` gains the inverse relation (`refreshTokens OpsRefreshToken[]`).
One migration.

## Login flow

`POST /auth/ops/login`, `@Public()`. Body: `OpsLoginDto { email, password,
totpCode? }`.

1. **Rate limit.** `RateLimitService.consume` keyed by `login:email:<email>`
   and `login:ip:<ip>`, e.g. 10 attempts per 15 minutes each — the same
   fixed-window pattern `AuthService.requestOtp` already uses against MSG91
   cost, applied here against credential stuffing.
2. **Look up the account.** `prisma.opsUser.findUnique({ where: { email } })`.
   A missing user, a disabled user (`disabledAt` set), and a correct lookup
   with a wrong password all fall through to the same response —
   `AppException(UNAUTHENTICATED, 'Invalid email or password')` — so a
   caller can't distinguish "no such account" from "wrong password."
3. **Verify password.** `bcrypt.compare(password, opsUser.passwordHash)`.
   Failure throws the same generic `UNAUTHENTICATED` as step 2.
4. **Verify TOTP, if enrolled.** If `opsUser.totpSecret` is set:
   - `totpCode` missing or `otplib`'s `authenticator.check(totpCode, secret)`
     false → throw the new `TOTP_REQUIRED` error code (see below). Identity
     is already confirmed at this point, so this is a distinct condition
     from "wrong password" and the client renders it as "enter your
     authenticator code" rather than "check your credentials."
   - If `totpSecret` is not set, `totpCode` is ignored if present.
5. **Issue a session.** `OpsTokenService.issueSession(opsUser.id)`:
   revokes any other live `OpsRefreshToken` rows for this user (one live
   session at a time, matching the worker behavior), then mints:
   - Access JWT: `Principal { sub: opsUser.id, role: 'ops' }` (no
     `deviceId` — the field is already optional on `Principal`).
   - Opaque refresh token: `randomBytes(48).toString('base64url')`,
     stored as `sha256` hash, same as `TokenService.mint`.

Response: `OpsLoginResponse extends TokenPair { opsUserId, email }`.

## Refresh and logout

- `POST /auth/ops/refresh`, `@Public()`. Body: `OpsRefreshDto { refreshToken
  }`. `OpsTokenService.rotate` mirrors `TokenService.rotate`: unknown token
  → `UNAUTHENTICATED`; already-rotated token → revoke the whole family and
  throw `SESSION_SUPERSEDED` (reuse detection); revoked or expired → the
  matching error. No `deviceId` check (nothing to compare against).
- `POST /auth/ops/logout`, `@Roles('ops')`, `@Idempotent()`. Revokes every
  live `OpsRefreshToken` for `principal.sub`.

## Error handling

One new code in `src/shared/errors/error-codes.ts`:

```ts
TOTP_REQUIRED: 'TOTP_REQUIRED', // 401
```

Everything else reuses existing codes: `UNAUTHENTICATED` (bad credentials,
expired/unknown refresh token), `SESSION_SUPERSEDED` (reuse detection,
revoked session), `RATE_LIMITED` (login throttling).

## Provisioning

`prisma/seed.ts` gains one more upsert-create-only block: a dev admin
`OpsUser` from `OPS_SEED_EMAIL` / `OPS_SEED_PASSWORD` env vars (hashed with
bcrypt before insert), following the file's existing "seed defaults, never
overwrite what's already there" style. No env vars set → the block is
skipped, so this stays optional for environments that provision ops users
another way.

## Dependencies

- `bcrypt` + `@types/bcrypt` — password hashing.
- `otplib` — TOTP verification (`authenticator.check`).

## Testing

- `ops-token.service.spec.ts` (mocked Prisma): mint on login, rotate happy
  path, reuse detection revokes the family, revoked/expired tokens
  rejected — same cases `token.service` would need if it had a spec today,
  scoped to the ops table.
- `ops-auth.service.spec.ts` (mocked Prisma, mocked `bcrypt`/`otplib`):
  unknown email, disabled account, wrong password, missing TOTP on an
  enrolled account, wrong TOTP, correct TOTP, and the no-TOTP-enrolled
  happy path all resolve to the right `AppException` or `OpsLoginResponse`.
