# Security

How the People's Budget Portal protects the data an LGU puts in it, how to report a problem, and what
is still open. The LGU that runs a deployment is the **personal information controller** of its data
(RA 10173); whoever hosts or maintains it for them is a **processor**.

## Reporting a vulnerability

Report it privately, never in a public issue: use **Security → Report a vulnerability** on
[the repository](https://github.com/Stride-Technologies/peoples-budget-portal/security/advisories/new) (GitHub's private vulnerability reporting). Say what you found, how to reproduce it and what
it exposes. You will get an acknowledgement within 3 working days.

| Severity | Target for a fix in a release |
|---|---|
| Critical | 7 calendar days |
| High | 30 calendar days |
| Medium, low | the next scheduled release |

If you run a deployment and suspect a breach of personal data, tell your Data Protection Officer at
once: the National Privacy Commission's 72-hour clock runs from discovery, not from the fix.

## Controls in place

| Area | Control | Where |
|---|---|---|
| Authentication | RS256 JWT; 15-min access token, 7-day refresh token stored as SHA-256 and **rotated** on every refresh; all refresh tokens revoked on password change/reset | `api/src/auth/` |
| Sessions | Tokens live in httpOnly, `SameSite=Lax` cookies (`Secure` in production); the API accepts only `Authorization: Bearer` from the Next server | `client/src/lib/session.ts`, `middleware.ts` |
| Passwords | bcrypt cost 12; invite-only accounts | `api/src/auth/`, `api/src/users/` |
| MFA | Emailed 6-digit code (`crypto.randomInt`, 15 min, newest only) at **every** administrator sign-in; other roles every 30 days. The code is redeemed only with the signed challenge a correct password earns, so it cannot stand in for the password. The fixed code `000000` needs `AUTH_FIXED_OTP=1` (laptops only) and is refused under `NODE_ENV` staging or production | `api/src/auth/auth.service.ts` |
| Account lifecycle | Every token path (login, codes, invites, resets, refresh) refuses a deactivated account; no reset link is sent to one. Logout revokes the refresh token it is given. Live activity streams end when the access token that opened them expires, and at once on a user's role, office, activation or grant change | `api/src/auth/`, `api/src/events/` |
| Brute force | `/auth/*` throttled 30 / 15 min per visitor IP; account locked 15 min after 5 failed passwords or codes (counted from `LOGIN_FAILED` audit rows) | `api/src/auth/` |
| Authorization | Global `JwtGuard` → `RolesGuard` → `PermissionGuard`; named permission keys + office scope; service-layer ownership checks. Nobody but a SUPER_ADMIN grants or invites with more than they hold (keys, offices, all-offices scope), or manages users outside their own office/CSO. Residents' names and emails on feedback reach only the `public_comments:*` moderation routes | `api/src/permissions/`, `api/src/users/user-access.ts` |
| Input | Global `ValidationPipe` with `whitelist` + `transform` (class-validator DTOs); decimals as validated strings | `api/src/main.ts` |
| Public forms | Throttle 5 / 10 min per visitor IP (forwarded as `X-Real-IP` by the client's server actions) → honeypot (silent 200) → reCAPTCHA v3 (score, action, hostname; fails **open** if Google is unreachable, by design) | `api/src/public/` |
| Non-production exposure | `X-Robots-Tag: noindex` and optional HTTP Basic auth on every non-production host | `client/src/middleware.ts` |
| Audit | `UserAuditLog` (logins, failed logins, role/permission/scope/password changes); `ProgramAuditLog` (field-level before/after, publish, revise, discard); ceiling history | |
| Secrets | One `.env` file beside `docker-compose.yml` on the server, readable by the deploy user only; `.env*` is gitignored; images are built on the server, so no registry credential exists | `.env.production.example` |
| Transport | TLS 1.2/1.3 via Let's Encrypt on nginx; HSTS (1 year) from both apps | `nginx/nginx.conf` |
| Headers | Client: CSP (self + GA4 + reCAPTCHA hosts only, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`; `frame-src 'self'` for one route, `/api/source-pdf`, the staff source viewer's proxy, which alone may be framed by our own pages and fetches only PDFs under `NEXT_PUBLIC_SOURCE_PDF_PREFIX` (unset: none) for a signed-in user), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. API: `nosniff`, `frame-ancestors 'none'`, `no-referrer`. Set in the apps, not nginx, so Azure dev/staging get them too | `client/next.config.ts`, `api/src/main.ts` |
| CORS | Denied except open data: `*` (GET/HEAD, no credentials) on `/api/v1/open-data/*` only; every other route `origin: false` — the browser never calls the rest of the API cross-origin | `api/src/main.ts` |
| Open data | Anonymous, read-only (`405` for writes); only cycles a super admin switched on, else `404`; 60 requests / min / visitor IP; output is an **allow-list** of named fields from the published snapshot, never a spread, with a salted-fixture test that fails if a staff id, email, provenance, line item or feedback gets through | `api/src/open-data/` |
| API docs | Swagger UI only where `NODE_ENV` is unset or `development`; off on staging and production | `api/src/main.ts` |
| Dependencies | `pnpm audit` on pre-push and in CI; advisories pinned through `pnpm.overrides`; unfixable advisories listed in `auditConfig.ignoreGhsas`, each with its reason in a comment beside it or in the commit that added it | `package.json` |

## Known gaps

| Gap | Severity |
|---|---|
| The rate-limit tracker trusts `X-Real-IP`. Safe behind the shipped nginx (it overwrites the header and the API has no public port); spoofable if you expose the API container directly | Low |
| CSP `script-src` allows `'unsafe-inline'`: Next.js streams its payload in inline scripts, and a nonce would make every public page dynamic. The other directives still apply | Low |
| The privacy policy and terms ship as templates. A deployment that sets `LEGAL_TEXT_EFFECTIVE` without a lawyer's review publishes text nobody checked | Compliance |
| Sign-in codes go by e-mail only; there is no authenticator-app or hardware-key option | Low |

## Personal data in the database

Budget data (programs, amounts, offices, published figures) is public record. These tables hold
personal data and must not be exported, sent to an AI service or copied to a test system without
your DPO's say: `users`, `user_*`, `lgu_users`, `ncpc_users`, `email_verifications`,
`refresh_tokens`, `password_reset_tokens`, `public_registry_feedback`, `ppmp_feedback`,
`program_comments`, `ppmp_comments`, `program_audit_logs`, and the Data Explorer's
`explorer_questions`, `explorer_model_calls`, `explorer_feedback` and `explorer_training_questions`.
`deploy/backup-db.sh` backs up all of them: treat the backup as personal data.

## The Data Explorer and AI services

The Data Explorer is **off by default** (`NEXT_PUBLIC_EXPLORER_ENABLED`, `EXPLORER_AI_ENABLED`).
Turned on, it sends residents' questions to a model provider you choose.

**Data Explorer Ask.** A resident's typed question is sent to the
configured model (`LLM_BASE_URL`) with the public catalogue, and to the embedding
endpoint (`EMBED_BASE_URL`, by default the same account) to match its words to
catalogue values; nothing else about them is. The question's vector is cached by a
hash of its text for 30 days, like the answer. The question log — `explorer_questions`, `explorer_model_calls`,
`explorer_feedback` — is personal data (free text can name a person): no IP, user
agent, user id or audio is stored; the browser's device id only as a salted hash
(`EXPLORER_DEVICE_SALT`); `EXPLORER_LOG_QUESTIONS=0` stores no visitor text at all;
a nightly job nulls text older than 12 months; it is read only with
`explorer:read-log` and never exported as open data. `EXPLORER_AI_ENABLED` is off unless set: turn it on only after your Data Protection Officer has cleared the model provider as a processor.

**Data Explorer chat and labels.** The chat sends the question, the open
sheet (a query of public fields) and the last four questions of the tab, as Ask does; question
text is stored only after `scrub` removes emails, phone numbers and long digit runs. The labelling
run (`db:label`) sends **budget text only** (row names, descriptions, offices, account titles; no
remarks, people or ids of people) to the model and the embedding endpoint, and stores each row's
text and vector in `explorer_rows`, which holds no personal data.

**Data Explorer inference backends and training capture.** Model calls go
through one port with three backends ([`docs/modules/inference-sidecar.md`](docs/modules/inference-sidecar.md)):
the configured OpenAI-compatible endpoint (as above), the **open-model sidecar** on the deployment's
own private network (`services/inference`; nothing leaves the host), or the **Stride inference API**,
which receives the same inputs and is refused at boot unless `EXPLORER_STRIDE_OPT_IN=1` (the
LGU's opt-in; budget-row inputs and outputs may be stored by Stride, a resident's question is not
unless captured below). **Training capture** keeps a question in `explorer_training_questions` only
when *both* keys are turned: the LGU's `EXPLORER_TRAINING_CAPTURE=1` — **off until the LGU's
privacy notice says questions may be kept to improve the service** — and the resident's own box,
unticked by default, for that question — and `EXPLORER_PRIVACY_NOTICE_VERSION` must name the
notice in force (stored with each row as the record of what the resident agreed to; a row is linked
to no one, so it cannot be withdrawn later, which the notice must say). The scrubber then fails
closed: an email, phone or landline number, long digit run, @handle or Facebook link, a title or a
Filipino person marker (*si, ni, kay, sina…*) followed by a name, or a Purok/Zone/Blk/Lot address
drops the question; otherwise a yes/no decision model (LAYA) is asked whether it names a private
person and P ≥ 0.2 drops it; no decision model, no answer, any error, or more than four scrubs in
flight drops it too. The person check runs on the deployment's own sidecar: with the decide backend
on the Stride API it is refused unless `EXPLORER_TRAINING_SCRUB_REMOTE=1`, because questions it
drops would still have reached Stride. Errors from a model endpoint are logged by status only (a
body can echo the question). The sidecar sits on an internal network only the API joins, serves no
`/docs`, caps request sizes, compares its key in constant time, and refuses to start without one
when `SIDECAR_REQUIRE_KEY=1` (the hosted Stride API); `STRIDE_API_URL` must be https. Nothing is stored
redacted, and no device key, IP or account goes with it. Rows are **deleted** after 12 months.
It is personal data: on the AGENTS.md list, never sent to an AI tool, never exported.

**Data Explorer share links.** `POST /public/explorer/snapshots` stores a
workbook so `/explore/w/<id>` can open a copy. The stored state is rebuilt from named fields only
(`checkWorkbook`; an unknown key is dropped), every sheet must pass the query validator, and it
is capped at 64 KB and throttled per IP. Its only free text is sheet and workbook names (≤ 60
characters, no markup; rendered as text); it stores no device key, IP or chat transcript. Rows
are immutable and keyed by a hash of the state, so a link cannot be edited by its sharer or
anyone else. Share pages are `noindex`. Open point (P8): a renamed sheet can carry any wording
on the LGU's domain.

## Services a deployment may use

Each is optional and set in `.env`. List the ones you turn on in your privacy policy.

| Service | What it receives | Setting |
|---|---|---|
| Your server (app, Postgres, Redis, nginx) | everything | `docker-compose.yml` |
| S3-compatible storage (DigitalOcean Spaces or another) | uploaded procurement documents, database backups | `DO_SPACES_*`; unset keeps files on the server |
| E-mail (SMTP, or Azure Communication Services) | recipient addresses, sign-in codes, invitations | `MAIL_PROVIDER` |
| reCAPTCHA v3 (Google) | visitor signals on the feedback forms | `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` |
| Google Analytics 4 | page views, after the visitor consents | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| A model provider (any OpenAI-compatible endpoint), or the bundled sidecar on your own server | Data Explorer questions and public budget text | `LLM_BASE_URL`, `EMBED_BASE_URL`, `EXPLORER_INFERENCE_*` |
