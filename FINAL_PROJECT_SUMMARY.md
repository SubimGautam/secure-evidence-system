# Secure Digital Evidence Chain-of-Custody System — Final Project Summary

A full-stack, production-shaped web application for tracking physical/digital
evidence and its chain of custody, built as a university cybersecurity
capstone. Stack: React (Vite) + Tailwind on the frontend, Node/Express +
Prisma + PostgreSQL on the backend, containerized with Docker Compose.

## 1. Features implemented

**Authentication**
- Registration and login (Argon2id password hashing)
- JWT access tokens (15 min) + rotating, DB-backed refresh tokens with reuse
  detection (a replayed, already-rotated token burns the entire session)
- TOTP MFA (Speakeasy) with QR enrollment, recovery codes, and replay
  protection (a code can't be reused within its validity window)
- Password reset via a mocked email step (console-logged link), single-use
  token, and full session revocation on reset
- Account lockout after repeated failed logins (combined per-IP and
  per-account throttling)
- Session management: list/revoke your own sessions, "log out other devices"

**Authorization (RBAC + ABAC)**
- Four roles: Admin, Officer, Evidence Custodian, Auditor
- A central permission matrix (`config/permissions.js`) gates every route
- Object-level ABAC on top of RBAC: only the current custodian may transfer
  an item or attach a file to it; only the addressed recipient may
  accept/reject a transfer; an Officer may only edit evidence they logged,
  and only before it enters custody transfer
- Admin has an explicit bypass on every ABAC check ("full access" is a
  deliberate rule, not an accident of role permissions)

**Evidence & chain of custody**
- Evidence CRUD with reference codes, status lifecycle (`COLLECTED` →
  `TRANSFER_PENDING` → `IN_CUSTODY` → …)
- Two-party custody transfer handshake (initiate → accept/reject), with a
  system-wide custody history view for Auditors/Admins
- Encrypted file upload/download: AES-256-GCM at rest, SHA-256 integrity
  hash computed before encryption, MIME allowlist, 10MB limit, filenames
  never used as storage paths

**Tamper-evident audit log**
- Every security-relevant action (auth, evidence, custody, admin actions)
  writes a hash-chained `AuditLog` entry: `entryHash = sha256(prevHash ‖
  timestamp ‖ actor ‖ eventType ‖ entity ‖ canonicalized-metadata)`
- Writes are serialized via a Postgres advisory lock so concurrent requests
  can't fork the chain, and are atomic with the action they describe (same
  DB transaction — if the audit write fails, the action rolls back too)
- `GET /audit-log/verify` recomputes the entire chain and pinpoints the
  first broken link, if any
- The `audit_logs` table has Postgres Row-Level Security forcing INSERT/SELECT-only,
  enforced against a **genuinely restricted runtime DB role** (see §3 for
  why that distinction mattered)

**Admin dashboard**
- User management: change role, activate/deactivate, lock/unlock
  (indefinite, admin-initiated — distinct from the automatic failed-login
  lockout, same underlying field), reset a user's MFA
- Per-user active session viewing and remote revocation
- System health panel (DB connectivity, uptime, live counts)
- Every admin action is itself an audit-logged event

**Auditor interface** (read-only, enforced server-side)
- Audit log viewer with event-type filtering and pagination
- One-click chain integrity verification with a clear pass/fail report
- System-wide custody history with search

**UI**
- Toast notifications, loading spinners, empty states, and search/filter
  across the evidence, custody history, and admin/audit views
- Responsive layout (a real mobile nav, not just reflowed desktop chrome)
- Role-aware navigation — a user only ever sees links to pages their role
  can use, backed by the same guard the page itself enforces

**Infrastructure**
- Multi-stage, non-root Docker images for both services; nginx (unprivileged)
  serves the SPA and reverse-proxies `/api` so the backend has zero public
  exposure
- `docker-compose.yml` brings up Postgres, backend, and frontend with
  health-gated startup ordering

## 2. Security features

| Area | What's in place |
|---|---|
| Passwords | Argon2id, OWASP-minimum parameters set explicitly (not library defaults) |
| Sessions/tokens | Refresh tokens hashed at rest, rotated, reuse-detected; access tokens held in memory only (never localStorage) |
| MFA | TOTP with replay protection; recovery codes hashed like passwords, single-use |
| Encryption at rest | AES-256-GCM for MFA secrets and evidence files, distinct keys derivable from one master key with a rotation-ready `encryptionKeyId` column |
| Authorization | RBAC + ABAC, deny-by-default, tested for vertical and horizontal privilege escalation |
| Mass assignment | `.strict()` Zod schemas reject unrecognized fields (e.g. a client can't slip `role` or `currentCustodianId` into a request body) |
| CSRF | `SameSite=Strict` cookie plus an explicit Origin/Referer check on the two cookie-authenticated routes (`/auth/refresh`, `/auth/logout`) |
| Rate limiting | Per-route limiters on login/register/password-reset, independent of each other (not pooled) |
| Security headers | Helmet defaults + a tightened CSP, since this is a pure JSON API with a separately-hosted SPA |
| Audit integrity | Hash chain + Postgres RLS enforced against a non-owner, non-superuser DB role |
| File uploads | MIME allowlist, size cap, memory-buffered (never touches disk unencrypted), random storage filenames |
| Error handling | Centralized handler, correlation IDs, no stack traces or internal details leak in production |
| Docker | Non-root containers, `npm ci` (not `install`) for reproducible builds, dev dependencies pruned from the runtime image |

### Issues found and fixed during this review

1. **CSRF defense-in-depth gap** — `/auth/refresh` and `/auth/logout`
   authenticate via cookie alone with no Origin check. Added
   `middleware/verifyOrigin.js`; verified it rejects forged/missing origins
   and doesn't break the real app (browser end-to-end test through the Vite
   proxy).
2. **A misleading lockout message** — the 423 response said "due to
   repeated failed sign-ins" even when an Admin had manually locked the
   account. Generalized the message.
3. **The most significant finding**: the Docker Compose Postgres setup had
   the application connecting as `POSTGRES_USER` — which the official
   `postgres` image bootstraps as a **database superuser**. Superusers
   bypass Row-Level Security unconditionally, regardless of `FORCE ROW
   LEVEL SECURITY`, which meant the audit-log immutability protection was a
   **silent no-op** in the Docker deployment specifically (it worked in
   local dev only because that environment's DB role happened to already be
   a non-superuser). This was caught by directly testing tamper attempts
   against the running Docker stack, not by inspection.

   Fixed with a real role separation: a Postgres init script
   (`backend/prisma/init/01-create-runtime-role.sh`) creates a second,
   ordinary role that the running application now connects as
   (`RUNTIME_DATABASE_URL`), while `DATABASE_URL` — the schema owner — is
   reserved for migrations only. Verified after the fix: the runtime role
   can `INSERT`/`SELECT` everywhere the app needs, including inserting new
   audit entries, but `UPDATE`/`DELETE` against `audit_logs` are
   confirmed no-ops, end-to-end through the actual running app.

### OWASP Top 10 — where each is addressed

- **A01 Broken Access Control** — RBAC + ABAC (§1), deny-by-default, tested for IDOR/horizontal/vertical escalation
- **A02 Cryptographic Failures** — Argon2id, AES-256-GCM, hashed tokens; TLS is a deployment-time concern (see limitations)
- **A03 Injection** — Prisma parameterized queries throughout; the one raw SQL call (`pg_advisory_xact_lock`) takes a hardcoded constant, never user input
- **A04 Insecure Design** — threat modeling done up front (see the architecture doc from earlier milestones); the custody handshake and audit chain are designed around real abuse cases, not bolted on
- **A05 Security Misconfiguration** — Helmet, locked CORS, non-root containers, no secrets in the repo, generic error responses in production
- **A06 Vulnerable Components** — `npm audit` reviewed; the one moderate finding is inside Prisma's own optional dev-server tooling (`prisma dev`, unused, pruned from the production image) — not exploitable in this app
- **A07 Auth Failures** — MFA, rate limiting, lockout, refresh rotation + reuse detection
- **A08 Software/Data Integrity Failures** — the hash chain and DB role separation above are direct answers to this category
- **A09 Logging/Monitoring Failures** — `morgan` request logging plus the audit chain; see limitations for what a larger deployment would still want
- **A10 SSRF** — not applicable; no feature fetches a user-supplied URL

## 3. Remaining limitations

- **No real email delivery** — password reset links are console-logged, not
  sent. Swapping `lib/mailer.js` for a real provider is a small, isolated change.
- **No TLS in local dev** — the architecture assumes a TLS-terminating edge
  in production; local Docker Compose runs plain HTTP between the browser
  and nginx.
- **No automated test suite** — verification throughout this project was
  live/manual (curl scripts and a real headless-browser walkthrough for
  every milestone), not a checked-in Jest/Playwright suite.
- **No CI/CD pipeline file** — lint/build/audit were run manually each
  session; there's no `.github/workflows/` wired up yet.
- **EXIF metadata isn't stripped** from uploaded images — a photo's GPS
  data would survive encryption at rest and be present in the decrypted
  download.
- **Audit log pagination is offset-based**, not cursor-based — fine at this
  project's scale, would need revisiting for a high-volume deployment.
- **Chain verification is a full recompute from genesis** every time —
  correct and fast enough here; a production system at scale would want
  periodic signed checkpoints (mentioned in the original architecture doc)
  so verification only replays since the last checkpoint.
- **Encryption key rotation has no operational tooling** — the schema
  supports it (`encryptionKeyId` on files), but there's no admin flow to
  actually rotate `ENCRYPTION_KEY` and re-encrypt existing data.
- **No "Cases" grouping** — evidence items stand alone; a Case parent
  (mentioned as a deliberate scope cut in an earlier milestone) was never added.

## 4. Suggested future improvements

- Wire up GitHub Actions: lint + build + `npm audit` + Docker build on every push
- Add a real test suite (unit tests for the audit hash chain and RBAC/ABAC
  middleware would have the highest value per test written)
- Real email provider integration for password reset
- TLS termination with a real (or at least self-signed, documented) cert
  for the Docker Compose demo path
- Structured logging (pino/winston) with correlation IDs threaded through,
  replacing/augmenting `morgan`
- EXIF stripping on image uploads (via `sharp`) before encryption
- Signed audit-log checkpoints for scalable verification
- A documented key-rotation runbook (and eventually a KMS instead of a
  single `.env` key)
- WebAuthn/passkey support alongside TOTP
- Case/matter grouping above individual evidence items
- An accessibility (a11y) pass — the UI was built with semantic HTML and
  keyboard-navigable controls throughout, but hasn't had a dedicated audit

---

*Every feature above was verified against the running application — not
just written and assumed correct — via direct API testing and, for the UI,
an actual headless-browser walkthrough of each flow.*
