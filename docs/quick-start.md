# Quick start

A working portal with the sample city, on your own machine. Needs Node 22, pnpm 10 and Docker.

```bash
pnpm install
```

```bash
docker compose -f docker-compose.dev.yml up -d
```

```bash
cp api/.env.example api/.env && cp client/.env.example client/.env.local
```

In `api/.env`:

- set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: the first administrator;
- paste a key pair into `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` (the two `openssl` commands are in the file);
- on a laptop, add `AUTH_FIXED_OTP=1`, so the sign-in code is always `000000`. Without it the code is
  printed in the API's log, because `MAIL_PROVIDER` is `console`.

```bash
pnpm --filter api exec prisma migrate deploy
```

```bash
pnpm --filter api db:seed:city
```

```bash
pnpm dev:api
```

```bash
pnpm dev:client
```

The site is at <http://localhost:3000>; sign in at <http://localhost:3000/login>. The API's own
documentation is at <http://localhost:8000/api/v1/docs>.

## What you get

Sample City: 21 offices, eight goals, and six offices' Annual Investment Program for 2027 (61
programs, 58 published and three held back as drafts). The Annual Budget and procurement sections
say that nothing has been posted yet, until a budget is enacted or a plan is published.

## Making it yours

1. Set the `LGU_*` variables in `api/.env` and `client/.env.local`: the portal's name everywhere.
2. Copy `api/prisma/data/sample-city/`, replace its files with your offices, goals and AIP
   ([what each file holds](../api/prisma/data/sample-city/README.md)), and load it into an empty
   database with `pnpm --filter api db:seed:city -- --dir /path/to/your-folder`.
3. Read the privacy policy and the terms at `/privacy-policy` and `/terms`. They ship as templates
   and say so until `LEGAL_TEXT_EFFECTIVE` is set.

To start over: `docker compose -f docker-compose.dev.yml down -v`, then from the `up -d` step.
