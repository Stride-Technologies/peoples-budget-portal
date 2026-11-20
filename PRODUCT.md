# Product

## Register

product

## In one line

The **People's Budget Portal**: where a local government's budget is prepared, published and
explained, so residents and civil society can see what is proposed, follow it through approval, and
respond to it.

## Why it exists

The Local Government Code gives civil society a seat in local planning and budgeting. In practice a
budget is built in spreadsheets passed between offices, and the public sees it late, as a PDF.

The portal was first built for the Naga City People's Budget Reform Project, led by WeSolve
Foundation with the City Government of Naga and the Naga City People's Council, and built by Stride
Technologies. This codebase is that portal made general, with three aims:

1. any LGU can deploy it without its original builders;
2. budget proposals are shown accurately and publicly as they move through planning and approval;
3. the data works beyond the portal (open data, a read-only API).

## What it is: two sides, one record

| Side | For | What they do |
|---|---|---|
| **Staff workflow** | Planning-office encoders, office heads, budget and executive reviewers, administrators | Encode the AIP, attach costs and tags, publish, revise, comment, prepare the proposed and enacted budget, export the DBM forms |
| **Public transparency** | Residents, CSOs, media, researchers, other LGUs | Read the AIP and the enacted Annual Budget as plain-language pages and tables; download the data; send feedback on any program or procurement plan |

Both sides read the same records: what staff publish is exactly what the public sees, and nothing a
revision changes reaches the public until it is republished.

## Users

| User | Needs | Access |
|---|---|---|
| **Planning-office encoders** | Enter every office's programs fast and correctly | `aip:write`, office-scoped |
| **Planning-office head** | Decide what is published and when; own the final AIP codes | `aip:publish` and admin keys |
| **Office heads and representatives** | Check what was published for their office; comment | read and comment |
| **Budget office, chief executive's office** | Review and export across offices | read, export, audit |
| **A people's council and its CSOs** | Review entries in their cluster and comment | read and comment |
| **Residents** | Understand where the money goes, in their language; say something about it | public site, no account |

Users work in a Philippine local-government office: desktop or laptop on office broadband,
task-focused, little patience for ambiguity. Field staff and many residents arrive on phones.

## Goals and non-goals

**Goals**
- Every published figure matches the LGU's own documents to the centavo, and says where it came from.
- A resident can find any program, understand what it buys, and respond, without an account.
- An LGU can stand the system up from this repository and its guides.

**Non-goals**
- Replacing the LGU's financial or accounting systems.
- Deciding policy, budget priorities or document formats: those are the LGU's calls.
- A mobile app.

## Brand Personality

Civic, transparent, precise. The portal is a civic instrument and should read like
one: authoritative without being cold, data-dense without being cluttered. The
process should feel legible, not labyrinthine. The public site reads like a
well-made printed report; the staff app like a good ledger.

## Anti-references

- Generic SaaS dashboard aesthetics: cream backgrounds, pastel gradients, oversized hero metrics.
- Consumer-app softness: rounded everything, illustration-heavy empty states, playful micro-copy.
- Legacy Philippine government systems: grey, table-dominant screens that feel punitive to use.
- Charts that need a legend to be read — figures are tables first ([`DESIGN.md`](DESIGN.md)).

## Design Principles

1. **State is sacred.** Every screen makes state obvious: draft, published, in revision; who acts next; what blocks publishing.
2. **The public sees exactly what was published.** No figure on the public site is computed differently from the staff view.
3. **Density earns trust.** Officials need to see a lot at once. Compression is a feature when hierarchy is clear.
4. **Actions, not options.** Every visible button is a real next step. Nothing disabled without saying why.
5. **Legibility before elegance.** If a visual choice trades readability for looks, it is wrong.
6. **Plain language for the public.** No jargon, nothing intimidating; budget terms are explained where they appear.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AAA** for text contrast, full keyboard navigation, and screen-reader support (semantic tables, landmarks, live regions for status changes). *Not yet met* — AA is what is measured today; gaps are tracked in issues.
- **Languages:** English and Filipino for site copy, overviews and editorial text, with room for a local language (Bikol is included as an example). The LGU's own line-item data stays in the language it was written in.
- Reduced-motion support for every animation (met).
- Touch targets at least 44×44 px for field staff and residents on phones.
