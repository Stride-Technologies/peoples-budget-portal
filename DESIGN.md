# Design

The portal has **two surfaces with two looks**, and they must not blur:

| Surface | Who | Look | Where |
|---|---|---|---|
| **Staff app** | CPDO encoders, office heads, reviewers, admins | Dense, neutral shadcn/ui (Base UI) on Tailwind v4 — tables, drawers, forms | `client/src/app/{aip-registry,programs,ppmp-registry,control-panel,dashboard,account}` |
| **Public editorial site** | Residents, NCPC, media, other LGUs | Warm paper ground, ink type, figures as real tables with in-cell bars | `client/src/app/(public)/**`, `client/src/components/public/` |

Brand, users and design principles: [`PRODUCT.md`](PRODUCT.md). This file is the
system: tokens, type, colour, the public-page rules, and accessibility.

## Tokens

Defined once in `client/src/app/globals.css` (`@theme inline` + `:root`).

| Group | Tokens | Notes |
|---|---|---|
| Editorial surface | `--paper` `#FDFDF8`, `--paper-raised` `#FFFFFF`, `--paper-tint` `#F7F6EE`, `--paper-deep` `#EFEDE1`, `--rule` `#E5E3DC` | Public pages only, via `bg-paper` / `border-rule` |
| Editorial ink | `--ink` `#151414` (18.0:1 on paper), `--ink-muted` `#5A5754` (7.0:1), `--ink-faint` `#6B6862` (5.4:1) | Every text tone clears AA; ink and ink-muted clear AAA |
| App (shadcn) | `--primary` `oklch(0.488 0.243 264)` blue, `--destructive`, `--muted`, `--border`, `--ring`, `--chart-1…5`, `--sidebar-*` | Staff app; a `.dark` set exists but no theme switch ships |
| Table surface | `--color-tbl-*`: `surface`, `fill…`, `rule…`, `ink…`/`muted…`/`faint`, `accent…`, and row grounds `band-office`, `band-section`, `row-program`/`-project`/`-activity` (+ `-hover`) | Shared registry tables — `AIPMasterList`, `SimpleSelect`, the finish-line chips, the public browse and PPMP lists |
| Radius | `--radius` `0.625rem`, scaled `sm…4xl` | |

**The shared registry tables paint with table surface tokens, never raw `slate`/`blue`
utilities.** `@theme` gives each `--color-tbl-*` the staff app's value (the exact
Tailwind shade those components used before), and `[data-editorial-table]` — set on
the public browse and PPMP wrappers — redefines the same variables onto paper/ink and
shades rows by level (office 8% → activity 0). The wrapper sets custom properties
only, so it restyles whatever uses a token and is coupled to no class name. A colour
added to one of these components as a raw utility shows the same on both surfaces:
use a `tbl-*` token, or add one to both blocks in `globals.css`.

## Type

| Role | Font | Variable |
|---|---|---|
| Body / UI | Mona Sans | `--font-sans` |
| Headings, display | Figtree 700 | `--font-heading` (`--font-display` resolves to it) |
| Numbers in code-ish contexts | Geist Mono | `--font-mono` |

Loaded with `next/font/google` in `client/src/app/layout.tsx`.

## Colour: the goals

An LGU's top-level goals (up to eight; "finish lines" in the database) each carry a colour of their
own, set with the goal. A goal with none falls back to its number's default, from
`client/src/lib/finish-lines.ts`:

| # | Hex |
|---|---|
| 1 | `#E5243B` |
| 2 | `#4C9F38` |
| 3 | `#FFB300` |
| 4 | `#26BDE2` |
| 5 | `#A21942` |
| 6 | `#FD6925` |
| 7 | `#DD1367` |
| 8 | `#00689D` |

AIP-registry exports use their own sector hues (General Public blue, Economic
amber, Environmental & Infrastructure green, Social purple); the rationale is in
[`docs/design/aip-complete-export.md`](docs/design/aip-complete-export.md#colour).

## Public-page rules

These broke before they were written down. Keep them.

- **The public editorial pages have no chart library, and that is deliberate.** Every figure on `/aip` and `/annual` is a real `<table>` with the bar rendered *inside the cell whose number it depicts* (`client/src/components/public/editorial/bar-table.tsx`). One artifact serves the screen reader and the sighted reader, so they cannot drift apart the way a chart and its shadow data table do; it also prints, survives JS being off, and costs no hydration. Recharts stays in the staff dashboard. **One exception: the Data Explorer workspace** (`/explore` on desktop, specs/018 W4) draws with Vega-Lite, because a chart builder needs every mark a person may ask for. It keeps the rule's reasons another way: every chart has a Table toggle with the same figures, labels are printed from the decimal strings, colour is the validated palette plus hatching for drafts, and the phone page stays tables-and-bars. Its look (specs/020) is one theme, `client/src/lib/explore/theme.ts`: a blueprint base of one ink on paper, a fine dashed grid and thin axis rules, a numbered key, colour-block KPI tiles with `readableOn` text, and titles and subtitles generated from the query. **No 3D, ever** (it distorts values, Pandey et al. 2015), and a chart that would mislead falls back to its table with the reason (`lint` in `compile.ts`). Aggregation lives in `client/src/lib/budget-overview.ts` (pure, unit-tested); a programme's amount is `proposedTotal`; fund attribution follows whichever row states the amount — **root PAs** for a programme that rolls up, the **programme's own `fundSources`** for one that states its own costs and holds no PAs (walking PAs unconditionally dropped 396 of 492 programmes and ₱2.54B into "not stated"); and money is summed in whole centavos.

- **Colour on the public pages is redundant, never load-bearing — and its foreground is measured, not chosen.** Bars and dots are painted by the row's identity, which *looks* like the categorical encoding the `dataviz` validator rejects for this palette (FL1 red ↔ FL2 green is ΔE 2.0 under deuteranopia). It is not one: every row is a labelled table row on its own line, so colour distinguishes nothing and only reinforces the text. **Delete the labels and it becomes a real failure.** Wherever a finish-line colour becomes a *background* carrying text, call **`readableOn(hex)`** from `client/src/lib/finish-lines.ts` — white fails WCAG AA on four of the eight hexes (amber `#FFB300` is 1.79:1, cyan 2.22, orange 2.91, green 3.32), and picking per colour by measurement puts the worst case at 4.52:1. `finish-lines.test.ts` asserts all eight clear AA.

- **Overview sections are one screen tall and the page snaps between them, using no script at all.** The behaviour that matters — advancing only once the figure beside the claim has been read to its end — is native scroll **chaining**: `[data-snap-figure]` is its own scroll container, so a wheel gesture is consumed by it until it bottoms out and only then reaches the document, which snaps. There is no wheel handler and **there must not be one**. This is also why **Lenis is not in this project** even though the reference site uses it: Lenis replaces native scrolling with a transform, which breaks both CSS scroll-snap and nested overflow panes. Snapping is scoped in `globals.css` to `lg` and up and to `prefers-reduced-motion: no-preference`, and uses `proximity` rather than `mandatory` so nobody is trapped between two sections.

- **Motion is two layers, and the gate is a class on `<html>`.** `globals.css` animates `[data-reveal]` / `[data-grow]` via `animation-timeline: view()` so the page moves with no JavaScript; `editorial-motion.tsx` then drives the same properties with **AnimeJS** (`animate`, `onScroll`, `stagger`, `splitText`) and sets `html.anime-motion`, which switches the CSS layer off so the two never contend. `<html>` is the gate because **React never touches it** — an earlier version wrote state onto `data-` attributes declared in JSX, which React owns and resets on re-render, and the bars silently never animated. Never animate a property React also sets inline: the bar's `width` comes from the data, so growth animates `scaleX`.

- **Budget-cycle copy is data, and an unconfirmed claim cannot reach production.** The ten stages, their plain-language text and which stage each live budget is at live in `client/src/lib/budget-cycle.ts`, read by both `/learn` and the home page, so the two cannot disagree. The home page shows them grouped into the six stages it has always shown, under their original names (`BUDGET_PHASES`): ten rows there read as noise. A statement the city has not yet confirmed is written as `{ unconfirmed, fallback }`: dev and staging show it highlighted with a review banner; production (`isProd`) renders the fallback, or drops it when the fallback is empty. Never write an unconfirmed claim as plain text. Which stages are under way (`LIVE_BUDGETS`: a headline `stage` plus any running `alongside` it, because stages overlap) is set by hand; update it when a budget moves on.

- **Every public page sits on `bg-paper`**, set once on `main` in `(public)/layout.tsx` — the browse table included, so its card reads as a sheet on the same ground. Do not reintroduce `bg-slate-50` there; it showed as a slab of grey above the footer on short pages.

## Accessibility and language

| Target | Status |
|---|---|
| **WCAG 2.2 AAA** for text contrast, full keyboard use, screen-reader landmarks and live regions | **Goal.** AA is what is measured today (editorial tones: worst case 4.52:1 on finish-line fills via `readableOn`). Gaps are tracked as issues. |
| Reduced motion | Met — snapping and motion are gated on `prefers-reduced-motion: no-preference`. |
| **English, Filipino and Bikol** for site copy, overviews and editorial text | **Goal.** No i18n layer exists yet; all copy is English. Line-item data (program names, descriptions from the city's AIP) stays in the language it was written in. |
| Touch targets ≥ 44×44 px | Goal for field staff on phones. |
