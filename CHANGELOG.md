# Changelog

Versions follow [Semantic Versioning](https://semver.org/). Until 1.0, a minor version may change
the database or a setting: read the notes before you update.

## 0.1.0 (unreleased)

The first release for any LGU: the portal built for Naga City, without Naga's data, identity,
importers and hosting.

- The LGU's name, type (city, municipality, province), seal, colours and contact details come from
  settings (`LGU_*`). Copy says "municipality", "Sangguniang Bayan" or "Governor" where it applies.
- What an LGU calls its top-level goals is a setting ("Development Priorities" by default).
- A sample city and one command to load a city's offices, goals and AIP into an empty database.
- A production stack built from the checkout: API, client, nginx with TLS, Redis, Postgres.
- The privacy policy and terms ship as templates and say so until the LGU reviews them.

- Fixed before release: text entered by staff could close a JSON-LD script element on public pages; CSV
  exports wrote cells starting with `=`, `+`, `-` or `@` as formulas; export downloads lost their progress
  percentage after the Next.js 16.4.5 update.

Known limits: see "Not yet general" in [`FEATURES.md`](FEATURES.md).
