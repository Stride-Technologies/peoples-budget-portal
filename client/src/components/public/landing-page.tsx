import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
} from "lucide-react";
import { VISIONS, readableOn } from "@/lib/finish-lines";
import { cn } from "@/lib/utils";
import {
  phaseState,
  whenFor,
  type LiveBudget,
} from "@/lib/budget-cycle";
import { PartnerLogo } from "@/components/public/partner-logo";
import { SourceLink } from "@/components/public/source-link";
import { LocaleLink } from "@/components/i18n/locale-link";
import { getLocale, getT } from "@/i18n/server";
import { Seal } from "@/components/brand/seal";
import { cycleCopy } from "@/i18n/budget-cycle";
import type { MessageKey } from "@/i18n/t";
import { getBrand } from '@/lib/brand-server';
import { messageVars } from '@/lib/brand';



type Stats = {
  budget: string | null;
  ppas: number | null;
  offices: number | null;
  publishedOffices: number | null;
  visions: number | null;
  fiscalYear: number;
  /** A cycle still being written, as opposed to one already enacted. */
  isProposal: boolean;
};

/** The organisations that built the software, credited on every deployment's home page. */
const COLLABORATORS: {
  name: string;
  role: MessageKey;
  logo: string | null;
  /** Optical size correction; see PartnerLogo. */
  logoScale?: number;
  href?: string;
}[] = [
  {
    name: "WeSolve Foundation",
    role: "home.partner.wesolve",
    logo: "/logos/wesolve.png",
    href: "https://www.wesolve.ph/",
  },
  {
    name: "Stride Technologies",
    role: "home.partner.stride",
    logo: "/logos/stride.png",
    // A solid filled glyph, so it out-weighs the two line-drawn marks at the
    // same box height.
    logoScale: 0.78,
    href: "https://www.stridetech.ph/",
  },
];

/**
 * The LGU the page is about: its names and its goals (development priorities).
 */
export interface LandingCity {
  placeName: string;
  shortName: string;
  goals: { id: string; name: string; color: string }[];
}

export async function LandingPage({
  stats,
  proposalYear,
  enactedYear,
  live = [],
  city,
}: {
  city: LandingCity;
  stats?: Stats;
  proposalYear?: number | null;
  enactedYear?: number | null;
  /** The live budgets and their stages (`liveBudgets`), newest first. */
  live?: readonly LiveBudget[];
}) {
  // Every hero figure says which document and which year it is from. Unlabelled,
  // "₱147.87M" reads as the city's budget, when it is a partly-published proposal
  // for one year — the single most misleading thing this page could do.
  // The budget still being made (the latest live year) and the stage it is at.
  // Undefined when the cycles could not be loaded: the "Now" note is left out
  // and the phases show no state, rather than a guessed stage.
  const t = await getT();
  // The colours of the page's rules and tiles: the LGU's goals, or the default eight until it has some.
  const palette = city.goals.length ? city.goals.map((g) => g.color) : VISIONS.map((v) => v.color);
  // The stage copy in the visitor's language (lib/budget-cycle.ts is the English).
  const locale = await getLocale();
  const { stages, phases } = cycleCopy(locale, messageVars(await getBrand(), locale));
  const making: LiveBudget | undefined = live[0];
  const nowStage = making ? stages[making.stage] : undefined;

  const HERO_STATS = stats
    ? [
        {
          value: stats.budget ?? "₱0.0B",
          label: stats.isProposal
            ? t("home.stat.proposed", { year: stats.fiscalYear })
            : t("home.stat.enacted", { year: stats.fiscalYear }),
        },
        {
          value: stats.ppas != null ? String(stats.ppas) : "0",
          label: stats.isProposal ? t("home.stat.programsPublished") : t("home.stat.programs"),
        },
        {
          value:
            stats.publishedOffices != null && stats.offices != null
              ? `${stats.publishedOffices} / ${stats.offices}`
              : (stats.offices?.toString() ?? "—"),
          label: stats.isProposal ? t("home.stat.officesPublished") : t("home.stat.offices"),
        },
        {
          value: stats.visions != null ? String(stats.visions) : "—",
          label: t("home.stat.finishLines"),
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Hero ── */}
      <section className="relative flex min-h-[82svh] flex-col justify-end overflow-hidden bg-ink">
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:px-8">
          <Seal priority className="h-20 w-20 sm:h-24 sm:w-24" />

          <p className="mt-10 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-paper/60">
            Buwis natin &middot; Boto natin &middot; Budget natin
          </p>

          <h1 className="mt-5 max-w-[46rem] font-display text-[clamp(2.5rem,1.4rem+4.6vw,5rem)] font-medium leading-[1.02] tracking-[-0.035em] text-paper">
            {t("home.hero.title")}
            <span className="text-paper/55">{t("home.hero.titleTail")}</span>
          </h1>

          <p className="mt-8 max-w-[34rem] text-base leading-7 text-paper/70 sm:text-lg sm:leading-8">
            {t("home.hero.lede")}
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <LocaleLink
              href={proposalYear ? `/aip/${proposalYear}/overview` : "/budget"}
              className="inline-flex items-center gap-2 rounded-full bg-paper px-7 py-3.5 text-sm font-medium text-ink transition-transform hover:scale-[1.02]"
            >
              {proposalYear
                ? t("home.hero.ctaProposed", { year: proposalYear })
                : t("home.hero.ctaBrowse")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </LocaleLink>
            {enactedYear && (
              <LocaleLink
                href={`/annual/${enactedYear}/overview`}
                className="inline-flex items-center gap-2 rounded-full border border-paper/30 px-7 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-paper/10"
              >
                {t("home.hero.ctaEnacted", { year: enactedYear })}
              </LocaleLink>
            )}
          </div>
        </div>

        {/* The site's signature rule, closing the hero into the page. */}
        <div aria-hidden="true" className="relative z-10 flex h-1.5">
          {palette.map((color, i) => (
            <span key={i} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      </section>

      {/* ── Hero figures ──
          Each one names its document and year. Unlabelled, "₱147.87M" reads as
          "the city's budget" when it is one partly-published proposal. */}
      {HERO_STATS.length > 0 ? (
        <section className="bg-paper py-14 sm:py-16" aria-label={t("home.stat.aria")}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <dl
              data-stagger
              className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
            >
              {HERO_STATS.map((stat, i) => (
                <div
                  key={stat.label}
                  className="border-t-2 pt-5"
                  style={{ borderColor: palette[i * 2] ?? 'var(--ink)' }}
                >
                  <dd className="font-display text-[clamp(2rem,1.4rem+1.8vw,2.75rem)] font-medium leading-none tracking-[-0.03em] text-ink">
                    {stat.value}
                  </dd>
                  <dt className="mt-3 text-sm leading-6 text-ink-muted">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {/* ── Budget Process ──
          The original layout, fed by `budget-cycle.ts` (the same data as
          /learn, so the two cannot disagree): the stage the budget being made
          is at, and the six stages the page has always shown, grouped from the
          ten. All ten live on /learn. */}
      <section className="bg-paper py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-2">
            {/* Left: context */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
                <Clock size={14} />
                {t("home.process.kicker")}
              </div>
              <h2 className="mb-8 font-display text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.03em] text-ink">
                {t("home.process.title")} <br className="hidden sm:block" />
                {t("home.process.titleTail")}
              </h2>

              {making && nowStage && (
              <div className="mb-6 rounded-r-xl border-l-4 border-amber-400 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 flex-shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      {t("home.process.now", { stage: nowStage.title })}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">
                      {nowStage.summary}{" "}
                      {t("home.process.stageOf", {
                        n: nowStage.n,
                        total: stages.length - 1,
                        year: making.fiscalYear,
                      })}
                    </p>
                    <LocaleLink
                      href={`/learn#stage-${nowStage.n}`}
                      className="mt-2 inline-flex text-sm text-amber-900 underline decoration-amber-300 underline-offset-4 transition-colors hover:decoration-amber-900"
                    >
                      {t("home.process.whatHappens")}
                    </LocaleLink>
                  </div>
                </div>
              </div>
              )}

              <LocaleLink
                href="/learn"
                className="inline-flex items-center gap-2 text-sm text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                {t("home.process.wholeCycle")}
              </LocaleLink>
            </div>

            {/* Right: visual timeline */}
            <div className="py-2">
              {phases.map((p, i) => {
                const state = making ? phaseState(making, p) : 'upcoming';
                return (
                  <div key={p.title} className="relative flex gap-4">
                    {/* Connector */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          state === "done"
                            ? "bg-green-500"
                            : state === "now"
                              ? "bg-amber-400 ring-4 ring-amber-100"
                              : "border-2 border-gray-200 bg-gray-100"
                        }`}
                      >
                        {state === "done" ? (
                          <CheckCircle2 size={15} className="text-white" />
                        ) : state === "now" ? (
                          <Clock size={13} className="text-white" />
                        ) : (
                          <span className="text-xs font-bold text-ink-faint">{i + 1}</span>
                        )}
                      </div>
                      {i < phases.length - 1 && (
                        <div
                          className={`w-px flex-1 ${state === "done" ? "bg-green-200" : "bg-gray-100"}`}
                          style={{ minHeight: 20 }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div
                      className={`flex-1 ${
                        state === "now"
                          ? "-ml-1 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"
                          : "pb-5 pt-0.5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-sm font-bold ${
                            state === "now"
                              ? "text-amber-900"
                              : state === "done"
                                ? "text-gray-800"
                                : "text-ink-faint"
                          }`}
                        >
                          {p.title}
                        </p>
                        {/* No stage is marked when the cycles could not be loaded. */}
                        {making && (
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-tight ${
                            state === "done"
                              ? "bg-green-100 text-green-700"
                              : state === "now"
                                ? "bg-amber-200 text-amber-800"
                                : "bg-gray-100 text-ink-faint"
                          }`}
                        >
                          {state === "done"
                            ? t("home.process.completed")
                            : state === "now"
                              ? t("home.process.inProgress")
                              : t("home.process.upcoming")}
                        </span>
                        )}
                      </div>
                      <p
                        className={`mt-0.5 text-xs ${
                          state === "now" ? "font-bold text-amber-700" : "text-ink-faint"
                        }`}
                      >
                        {making ? whenFor(p.when, making.fiscalYear) : null}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── The LGU's goals ── */}
      <section className="bg-paper-tint py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-3 font-display text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] font-medium tracking-[-0.03em] text-ink">
              {t("home.fl.title")}
            </h2>
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-ink-faint">
              {t("home.fl.lede")}
            </p>
          </div>

          {city.goals.length > 0 && (
            <ul className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
              {city.goals.map((goal, i) => (
                <li
                  key={goal.id}
                  className="flex flex-col gap-3 rounded-2xl p-5 shadow-sm"
                  style={{ backgroundColor: goal.color, color: readableOn(goal.color) }}
                >
                  <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                    {t("home.fl.vision", { n: i + 1 })}
                  </span>
                  <p className="line-clamp-3 text-sm font-bold leading-snug">{goal.name}</p>
                </li>
              ))}
            </ul>
          )}

        </div>
      </section>

      {/* ── Open source and who built it ── */}
      <section className="bg-paper-tint py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className={cn("grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]")}>
            <div className="bg-paper-raised p-7 sm:p-9">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ink text-paper">
                  <Code2 size={16} />
                </span>
                <div>
                  <p className="font-display text-lg font-medium tracking-[-0.02em] text-ink">
                    {t("home.oss.title")}
                  </p>
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                    {t("home.oss.kicker")}
                  </p>
                </div>
              </div>
              <p className="mt-6 max-w-prose text-[0.9375rem] leading-7 text-ink-muted">
                {t("home.oss.body")}
              </p>
              <p className="mt-7">
                <SourceLink label={t("home.oss.source")} />
              </p>
            </div>

            <div className="bg-paper-raised p-7 sm:p-9">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                {t("home.oss.builtBy")}
              </p>
              <ul className="mt-6 flex flex-col gap-6">
                {COLLABORATORS.map((org) => (
                  <li key={org.name} className="flex items-center gap-4">
                    {org.logo && <PartnerLogo src={org.logo} scale={org.logoScale} />}
                    <div>
                      <p className="text-sm font-medium leading-tight text-ink">
                        {org.href ? (
                          <Link
                            href={org.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
                          >
                            {org.name}
                          </Link>
                        ) : (
                          org.name
                        )}
                      </p>
                      <p className="mt-1 text-[0.8125rem] leading-6 text-ink-muted">
                        {t(org.role)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
