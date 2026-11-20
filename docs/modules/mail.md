# Module: `mail`

**Folder:** `api/src/mail/`

## Purpose

Sends transactional email — invitations, email-verification (2FA) codes, and
password-reset links. It is consumed by [`auth`](auth.md) and
[`users`](users.md), and exposes a dev/preview outbox endpoint when the console
provider is active.

## Adapter selection

`MailModule` picks its adapter from `MAIL_PROVIDER` when set:

| `MAIL_PROVIDER` | Adapter | Configuration |
|---|---|---|
| `console` | `ConsoleMailAdapter` | Logs to stdout and captures recent mail in memory |
| `azure-communication` | `AzureCommunicationEmailAdapter` | Uses the ACS Email SDK with `ACS_EMAIL_ENDPOINT`, `AZURE_CLIENT_ID`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` |
| `smtp` | `SmtpMailAdapter` | Opt-in fallback requiring SMTP credentials |

If `MAIL_PROVIDER` is unset, staging/production default to
`azure-communication`; all other environments default to `console`. Dev and PR
previews are configured with `MAIL_PROVIDER=console`, so they never send real
email by default.

## Dev outbox

`GET /mail/outbox` is available only while the resolved provider is `console`.
It returns the latest 100 captured messages, pruned after 24 hours.

- `SUPER_ADMIN` sees all captured console mail.
- `HEAD` sees only invite messages scoped to their own office or CSO.
- The response includes recipient, subject, timestamp, message type, and a
  copyable invite/reset/code value when one exists.

## Service

- **`MailService`** — exposes a `send()`-style API for the transactional
  message types. Callers pass the recipient and the template data; the adapter
  handles delivery. Invitation templates include the activation link plus the
  invited account's role and office/organisation display name when one applies.

## Consumers

- [`auth`](auth.md) — verification codes, password-reset links
- [`users`](users.md) — invitation emails

## Dependencies

`ConfigService` (adapter selection and provider settings).

## Related

- [deployment.md](../deployment.md) — ACS Email provisioning and mail env vars
- [auth.md](auth.md), [users.md](users.md) — the flows that send mail
- [Microsoft ACS Email SDK quickstart](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/send-email)
- [Microsoft ACS SMTP quickstart](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/send-email-smtp/send-email-smtp)
