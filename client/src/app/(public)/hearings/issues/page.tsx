import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { HearingsNav, HearingsPage } from '@/components/public/hearings/chrome';
import { CARD, EYEBROW, GoalDot, MachineNotice, formatDay } from '@/components/public/hearings/parts';
import { getLocale, getT } from '@/i18n/server';
import { loadGoals, loadIndex, loadSite, loadSummary } from '@/lib/hearings/api';
import { bodiesOf, clock, summaryLangFor, type SessionEntry, type SummaryIssue } from '@/lib/hearings/format';
import { cn } from '@/lib/utils';

type Issue = SummaryIssue & { session: SessionEntry };
const TAB = 'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors';

/** `/hearings/issues?by=cluster`: every issue of every session, under the LGU's goals or its clusters. */
export default async function HearingsIssuesPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const [{ by }, t, locale] = await Promise.all([searchParams, getT(), getLocale()]);
  const byCluster = by === 'cluster';
  const [index, site, goals] = await Promise.all([loadIndex(), loadSite(), loadGoals()]);
  const lang = summaryLangFor(locale);
  const summaries = await Promise.all(index.map((s) => loadSummary(s.id, lang)));
  const issues: Issue[] = index.flatMap((session, i) => (summaries[i]?.issues ?? []).map((x) => ({ ...x, session })));

  const groups = byCluster
    ? [
        ...goals.clusters.map((c) => ({ key: c, title: <>{c}</>, items: issues.filter((x) => x.cluster === c) })),
        { key: '', title: <>{t('hearings.issues.unassigned')}</>, items: issues.filter((x) => !x.cluster || !goals.clusters.includes(x.cluster)) },
      ]
    : [
        ...Object.entries(goals.finishLines).map(([n, name]) => ({
          key: n,
          title: (
            <span className="flex items-center gap-3">
              <GoalDot n={Number(n)} name={name} />
              {name}
            </span>
          ),
          items: issues.filter((x) => (x.finishLines ?? []).includes(Number(n))),
        })),
        { key: '', title: <>{t('hearings.issues.unassigned')}</>, items: issues.filter((x) => !(x.finishLines ?? []).length) },
      ];
  const dateTag = locale === 'fil' ? 'fil-PH' : 'en-PH';

  return (
    <HearingsPage>
      <HearingsNav active="issues" bodies={bodiesOf(index, site)} />
      <p className={EYEBROW}>{t('hearings.nav.issues')}</p>
      <h1 className="mt-4 max-w-[40rem] font-display text-[clamp(2rem,1.2rem+3.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        {t('hearings.issues.title')}
      </h1>
      <p className="mt-5 max-w-[38rem] text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">{t('hearings.issues.lede')}</p>
      <MachineNotice label={t('hearings.notice.assigned')}>{t('hearings.notice.issues')}</MachineNotice>

      <div role="group" aria-label={t('hearings.issues.groupBy')} className="mt-8 flex flex-wrap gap-2">
        {[
          { on: !byCluster, href: '/hearings/issues', label: t('hearings.issues.byGoal') },
          { on: byCluster, href: '/hearings/issues?by=cluster', label: t('hearings.issues.byCluster') },
        ].map((b) => (
          <Link
            key={b.href}
            href={b.href}
            aria-current={b.on ? 'true' : undefined}
            className={cn(TAB, b.on ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper-raised text-ink-muted hover:border-ink hover:text-ink')}
          >
            {b.label}
          </Link>
        ))}
      </div>

      <div className="mt-8 space-y-6">
        {groups
          .filter((g) => g.key || g.items.length)
          .map((g) => (
            <section key={g.key || 'none'} className={CARD}>
              <p className={EYEBROW}>{t(g.items.length === 1 ? 'hearings.issues.countOne' : 'hearings.issues.count', { count: g.items.length })}</p>
              <h2 className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{g.title}</h2>
              {g.items.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">{t('hearings.issues.none')}</p>
              ) : (
                g.items.map((x, i) => (
                  <div key={i} className="mt-4 text-sm leading-6">
                    <p>
                      <strong>{x.topic}</strong> — {x.summary}
                    </p>
                    <p className="text-ink-muted">
                      <Link href={`/hearings/session/${x.session.id}${x.at ? `?t=${Math.floor(x.at)}` : ''}`} className="underline underline-offset-4">
                        {x.session.title}
                        {x.at ? ` · ${clock(x.at)}` : ''}
                      </Link>
                      {x.session.date ? ` · ${formatDay(x.session.date, dateTag)}` : ''}
                      {!byCluster && x.cluster ? ` · ${x.cluster}` : ''}
                    </p>
                  </div>
                ))
              )}
            </section>
          ))}
      </div>
    </HearingsPage>
  );
}
