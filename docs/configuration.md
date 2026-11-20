# Configuration

Every setting is an environment variable. In production they live in one `.env` beside
`docker-compose.yml` (`.env.production.example` lists them all, with comments). On a laptop the API
reads `api/.env` and the client `client/.env.local`.

## Whose portal this is

The API and the client read the same variables: set them in both places on a laptop.

| Variable | Example | Default |
|---|---|---|
| `LGU_SHORT_NAME` | `San Isidro` | `Sample` |
| `LGU_TYPE` | `city`, `municipality` or `province` | `city` |
| `LGU_PROVINCE` | `Nueva Ecija` (the region, for an independent city) | empty |

Those three derive every name. Set one of these only when the LGU words it differently:

| Variable | Derived default (city / municipality / province) |
|---|---|
| `LGU_PLACE_NAME` | "San Isidro City" / "San Isidro" / "San Isidro" |
| `LGU_OFFICIAL_NAME` | "City of …" / "Municipality of …" / "Province of …" |
| `LGU_GOVERNMENT` | "City Government of …" / "Municipal Government of …" / "Provincial Government of …" |
| `SITE_NAME` | "<place name> Budget Portal" |
| `STAFF_APP_NAME` | "<short name> Open Budget Portal" |

`LGU_TYPE` also words the copy: "the municipality", "municipal offices", "Sangguniang Bayan";
"Governor" and "Sangguniang Panlalawigan" for a province; and the titles on the signature blocks of
LBP Forms 4 and 7.

| Variable | What it does |
|---|---|
| `LGU_SEAL_SRC` | The seal, a file under `client/public` (`/seal.png`). Unset draws a monogram of the initials |
| `SITE_PALETTE` | `civic-blue`, `harbor-teal`, `forest`, `maroon`, `slate` or `amber-ink` |
| `LGU_WEBSITE` | The LGU's own site, linked from the footer |
| `LGU_ADDRESS` | Footer address; separate lines with `\|` |
| `LGU_CONTACT_EMAIL`, `LGU_CONTACT_PHONE` | Where questions about the portal and personal data go (privacy policy, terms) |
| `LGU_BUDGET_ARCHIVE_URL`, `LGU_BUDGET_ARCHIVE_FROM` | Where older budgets are posted, and the first year there |
| `LEGAL_TEXT_EFFECTIVE` | The date the privacy policy and terms took effect ("June 18, 2026"). Unset, both pages say they are an unreviewed template |

## Set when the client is built

`NEXT_PUBLIC_*` values are compiled into the pages. Change one, rebuild the client.

| Variable | What it does |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | The site's address, for canonical links, the sitemap and share cards. In production `docker-compose.yml` sets it from `SITE_HOST` |
| `NEXT_PUBLIC_SITE_ENV` | Exactly `production` lets search engines in. Anything else: `noindex` and a closed `robots.txt` |
| `NEXT_PUBLIC_GOAL_NAME`, `NEXT_PUBLIC_GOALS_NAME` | What the LGU calls a top-level goal and its plural. Default "Development Priority" / "Development Priorities". Give the API the same two |
| `NEXT_PUBLIC_SOURCE_URL` | Where this deployment's source code is published. The AGPL asks whoever runs a modified copy to offer its source: a fork puts its own repository here. Unset, the "Source code" links go to the upstream project |
| `NEXT_PUBLIC_SOURCE_PDF_PREFIX` | The folder of the LGU's website whose scanned budget PDFs staff may open in the source viewer. Unset: none |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4, shown only after the visitor consents. Unset: no analytics |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA v3 site key for the feedback forms |
| `NEXT_PUBLIC_EXPLORER_ENABLED` | `1` shows the Data Explorer |
| `NEXT_PUBLIC_HEARINGS_API_URL` | The address of a hearings API ([`hearings-api.md`](hearings-api.md)). Set: the portal shows the council's sessions at `/hearings`. Unset: no hearings pages |
| `HEARINGS_DIR` | Read by `docker-compose.yml`, not the client: the folder nginx serves at `/hearings-data/`, for an LGU that makes its own hearings data ([`modules/hearings.md`](modules/hearings.md)). Default `/var/www/hearings` |

## The API

| Variable | What it does |
|---|---|
| `DATABASE_URL` | PostgreSQL 15 or later. No extension is needed |
| `REDIS_URL` | Cache and live-update fan-out. Unset: in-process, one API instance only |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | RS256 key pair, each on one line with `\n` for newlines |
| `FRONTEND_URL` | The public site's address: used in e-mails and exports |
| `MAIL_PROVIDER` | `smtp`, `azure-communication`, or `console` (prints e-mails in the log: laptops only) |
| `STORAGE_PROVIDER` | `do-spaces` (any S3-compatible bucket, `DO_SPACES_*`) or `local` (a folder in the API: not for production). Default: `do-spaces` in production |
| `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`, `RECAPTCHA_EXPECTED_HOSTNAME` | reCAPTCHA v3 for public feedback |
| `AUTH_FIXED_OTP` | `1` makes every sign-in code `000000`. Laptops only: refused in staging and production |
| `SEED_ADMIN_*` | The first administrator, created by the seed |
| `SEED_CITY_DIR` | The city folder the reference seed reads ([loading-your-data.md](loading-your-data.md)) |

## Languages

English and Filipino are on. A language shows in production only when
`client/src/i18n/review.json` records that a reviewer has read it; Bikol ships as an example of a
local language. To add one: add it to `client/src/i18n/locales.ts`, add its `messages/<code>.json`,
and add its words for city, municipality and province to `NOUN` in `client/src/lib/brand.ts`.
`pnpm translate` drafts translations with a model you configure; a person must review them.

## The Data Explorer

Off by default. `NEXT_PUBLIC_EXPLORER_ENABLED=1` and `EXPLORER_ENABLED=1` turn on the chart builder,
which needs no outside service. `EXPLORER_AI_ENABLED=1` adds the question box, which sends what
residents type to a model provider (`LLM_BASE_URL`, or the bundled sidecar on your own server):
read [`SECURITY.md`](../SECURITY.md) and [`modules/data-explorer.md`](modules/data-explorer.md)
first. Its topic and label lists were tuned on one city's budget, and its map is that city's
barangays: expect to adjust both.
