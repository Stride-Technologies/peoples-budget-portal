import { VISIONS, readableOn } from '@/lib/finish-lines';
import { getT } from '@/i18n/server';
import { rich } from '@/i18n/rich';

/**
 * Explanatory diagrams for `/learn`.
 *
 * Built from HTML and CSS rather than SVG or a chart library, for the same reason
 * the figures on the Overview are tables: the text is real text, so it is
 * selectable, searchable, translatable, reflows at 390px and reads correctly to a
 * screen reader. An SVG of the same thing would be a picture of an explanation.
 */

// ─── How to read an AIP reference code ───────────────────────────────────────

/**
 * The seven segments of the city's own reference code, annotated.
 *
 * Every entry on this site carries one, and it is the most opaque thing a visitor
 * meets — `8000-2-03-58-002-001-000` looks like a serial number. It is not: each
 * group says something, and knowing that turns the code into a description of
 * where the entry sits.
 *
 * The worked example is a real published entry (ABED's institutional capacity
 * programme), not an invented one, so a reader can find it in Browse.
 *
 * Two properties are worth stating outright because they surprise people: the
 * code **numbers rows, it does not add them up** — a parent's code is not a sum
 * of its children's — and it **carries no year**, so the same string is reissued
 * every fiscal year. Spec: `api/docs/aip-reference.md` §7.
 */
// Labels and meanings: `code.<id>.*` in the catalogue (specs/014).
const CODE_SEGMENTS = [
  { id: 'sector', value: '8000', color: VISIONS[0].color },
  { id: 'level', value: '2', color: VISIONS[1].color },
  { id: 'officeType', value: '03', color: VISIONS[2].color },
  { id: 'office', value: '58', color: VISIONS[3].color },
  { id: 'section', value: '002', color: VISIONS[4].color },
  { id: 'program', value: '001', color: VISIONS[5].color },
  { id: 'entry', value: '000', color: VISIONS[7].color },
] as const;

export async function AipCodeAnatomy() {
  const t = await getT();
  return (
    <figure className="m-0">
      {/* The code, with each segment tinted to match its explanation below. */}
      <div className="overflow-x-auto">
        <div
          aria-hidden="true"
          className="flex min-w-fit items-stretch gap-1 font-mono text-[clamp(0.9rem,0.6rem+1.1vw,1.5rem)]"
        >
          {CODE_SEGMENTS.map((seg, i) => (
            <span key={seg.id} className="flex items-stretch gap-1">
              <span
                className="rounded-md px-2 py-2.5 tabular-nums"
                style={{
                  backgroundColor: seg.color,
                  color: readableOn(seg.color),
                }}
              >
                {seg.value}
              </span>
              {i < CODE_SEGMENTS.length - 1 && (
                <span className="self-center text-ink-faint">&ndash;</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <figcaption className="sr-only">
        {t('code.caption')}
      </figcaption>

      <dl className="mt-8 space-y-5">
        {CODE_SEGMENTS.map((seg) => (
          <div
            key={seg.id}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:grid-cols-[4rem_9rem_minmax(0,1fr)]"
          >
            <dt
              className="rounded-md px-2 py-1 text-center font-mono text-xs tabular-nums"
              style={{
                backgroundColor: seg.color,
                color: readableOn(seg.color),
              }}
            >
              {seg.value}
            </dt>
            <dd className="col-start-2 text-sm font-medium text-ink sm:col-start-2">
              {t(`code.${seg.id}.label`)}
            </dd>
            <dd className="col-span-2 col-start-1 mt-1.5 text-[0.9375rem] leading-7 text-ink-muted sm:col-span-1 sm:col-start-3 sm:mt-0">
              {t(`code.${seg.id}.meaning`)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 max-w-prose border-l-2 border-ink pl-4 text-[0.9375rem] leading-7 text-ink-muted">
        {rich(t('code.not'), {
          not: <strong className="font-semibold text-ink">{t('code.notWord')}</strong>,
        })}
      </p>
    </figure>
  );
}

// ─── An appropriation becomes spending ───────────────────────────────────────

// `money.<id>.*` in the catalogue (specs/014).
const MONEY_STEPS = [
  { id: 'appropriation', onSite: true },
  { id: 'allotment', onSite: false },
  { id: 'obligation', onSite: false },
  { id: 'disbursement', onSite: false },
] as const;

/**
 * The four steps between a budget line and money leaving the treasury.
 *
 * This is the single most common misreading of the whole site — that a figure
 * here is money spent. It is step one of four. The diagram marks which step this
 * site actually records, so the limit is visible rather than buried in a caveat.
 */
export async function MoneyFlow() {
  const t = await getT();
  return (
    <figure className="m-0">
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-4">
        {MONEY_STEPS.map((s, i) => (
          <li
            key={s.id}
            className={
              s.onSite
                ? 'flex flex-col bg-ink p-5 text-paper'
                : 'flex flex-col bg-paper-raised p-5'
            }
          >
            <span
              aria-hidden="true"
              className={`font-mono text-[0.625rem] tabular-nums ${
                s.onSite ? 'text-paper/60' : 'text-ink-faint'
              }`}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className={`mt-3 font-display text-lg font-medium tracking-[-0.02em] ${
                s.onSite ? 'text-paper' : 'text-ink'
              }`}
            >
              {t(`money.${s.id}.step`)}
            </span>
            <span
              className={`mt-2 text-[0.8125rem] leading-6 ${
                s.onSite ? 'text-paper/75' : 'text-ink-muted'
              }`}
            >
              {t(`money.${s.id}.what`)}
            </span>
            {s.onSite && (
              <span className="mt-4 inline-flex w-fit rounded-full bg-paper px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-ink">
                {t('money.thisSite')}
              </span>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="mt-5 max-w-prose text-[0.9375rem] leading-7 text-ink-muted">
        {t('money.caption')}
      </figcaption>
    </figure>
  );
}

// ─── Where the money sits ────────────────────────────────────────────────────

/**
 * Why a program and the single entry inside it can show the same figure.
 *
 * It looks like the amount has been counted twice. It has not: when a program
 * lists projects and activities, the money is recorded on them and the program
 * shows their sum, so a program with one child necessarily matches it. The
 * caption also says the other case, because it is the common one: most programs
 * list no children and state their own amount (`Program.proposedTotal`, see
 * ARCHITECTURE-ESSENTIALS). An earlier caption said a program "holds no money
 * of its own", which was false for 396 of the 492 published 2027 programs.
 */
export async function PpaHierarchy() {
  const t = await getT();
  const accent = VISIONS[3].color;
  return (
    <figure className="m-0">
      <div className="rounded-2xl border border-rule bg-paper-raised p-5 sm:p-7">
        {/* Parent */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-4">
          <span className="font-display text-lg font-medium tracking-[-0.02em] text-ink">
            {t('ppa.program')}
          </span>
          <span className="font-mono text-sm tabular-nums text-ink">
            &#8369;5.0M
          </span>
          <span className="w-full text-[0.8125rem] leading-6 text-ink-muted">
            {t('ppa.programNote')}
          </span>
        </div>

        {/* Children */}
        <ul className="mt-4 space-y-3 pl-4 sm:pl-8">
          {[
            { name: t('ppa.project'), amount: '₱3.0M', note: t('ppa.projectNote') },
            { name: t('ppa.activity'), amount: '₱2.0M', note: t('ppa.activityNote') },
          ].map((child) => (
            <li
              key={child.name}
              className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-2 pl-4"
              style={{ borderColor: accent }}
            >
              <span className="text-sm font-medium text-ink">{child.name}</span>
              <span className="font-mono text-sm tabular-nums text-ink">
                {child.amount}
              </span>
              <span className="w-full text-[0.8125rem] leading-6 text-ink-muted">
                {t('ppa.recordedHere', { note: child.note })}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-5 max-w-prose text-[0.9375rem] leading-7 text-ink-muted">
        {t('ppa.caption')}
      </figcaption>
    </figure>
  );
}
