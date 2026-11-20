'use client';

/**
 * The workspace guide (specs/018 redesign P7, W13): a `?` panel with how-tos,
 * shortcuts, what each source holds and the starter workbooks, and an "About
 * the data" tab (which documents exist, what a draft is, the three money
 * words). Also the starter list and the blank-sheet lesson the canvas shows.
 * No first-visit tour: the blank sheet and this panel are the guide.
 */
import { LayoutGrid } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { LocaleLink } from '@/components/i18n/locale-link';
import { useT } from '@/i18n/locale-provider';
import type { MessageKey } from '@/i18n/t';
import type { SourceInfo } from '@/lib/explore/compile';
import type { Starter } from '@/lib/explore/starters';
import type { Catalogue } from '@/lib/explore/view-url';

export type GuideTab = 'guide' | 'about';

const KINDS = ['aip', 'lep', 'ordinance'] as const;
const HOWTO = ['chart', 'compare', 'filter', 'drill', 'records', 'board', 'share'] as const;
const CAVEATS = ['published', 'lep', 'themes', 'income', 'funds'] as const;

/** The starters as a list of Open buttons; on the guide's first tab and on a blank sheet. */
export function StarterList({ starters, onOpen }: { starters: Starter[]; onOpen: (s: Starter) => void }) {
  const t = useT();
  if (!starters.length) return null;
  return (
    <ul className="starters">
      {starters.map((s) => (
        <li key={s.id}>
          <button type="button" className="starter" onClick={() => onOpen(s)} data-testid={`starter-${s.id}`}>
            <LayoutGrid size={16} aria-hidden />
            <span>
              <b>{s.workbook.name}</b>
              <small>{t(`explore.guide.starter.${s.id}.blurb` as MessageKey)}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Guide({
  open,
  onOpenChange,
  tab,
  setTab,
  catalogue,
  sources,
  starters,
  onOpenStarter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: GuideTab;
  setTab: (t: GuideTab) => void;
  catalogue: Catalogue;
  sources: SourceInfo[];
  starters: Starter[];
  onOpenStarter: (s: Starter) => void;
}) {
  const t = useT();
  const years = (kind: string) =>
    catalogue.documents
      .filter((d) => d.kind === kind)
      .sort((a, b) => a.year - b.year)
      .map((d) => (d.draft ? t('explore.guide.about.yearDraft', { year: d.year }) : `FY${d.year}`));
  const anyDraft = catalogue.documents.some((d) => d.draft);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ws-guide data-[side=right]:w-[440px] data-[side=right]:sm:max-w-[440px]" data-testid="guide">
        <div className="guide-h">
          <SheetTitle className="guide-title">{t('explore.guide.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('explore.guide.description')}</SheetDescription>
          <div className="guide-tabs" role="group" aria-label={t('explore.guide.title')}>
            {(['guide', 'about'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
                {t(`explore.guide.tab.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="guide-body">
          {tab === 'guide' ? (
            <>
              <section>
                <h2>{t('explore.guide.startHead')}</h2>
                <ol className="ways">
                  {(['ask', 'drag', 'starter'] as const).map((k) => (
                    <li key={k}>
                      <b>{t(`explore.guide.start.${k}Title`)}</b> {t(`explore.guide.start.${k}`)}
                    </li>
                  ))}
                </ol>
              </section>
              {starters.length > 0 && (
                <section>
                  <h2>{t('explore.guide.startersHead')}</h2>
                  <StarterList starters={starters} onOpen={onOpenStarter} />
                </section>
              )}
              <section>
                <h2>{t('explore.guide.howtoHead')}</h2>
                <ul className="howto">
                  {HOWTO.map((k) => (
                    <li key={k}>
                      <b>{t(`explore.guide.howto.${k}Title`)}</b> {t(`explore.guide.howto.${k}`)}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2>{t('explore.guide.sourcesHead')}</h2>
                <dl className="defs">
                  {sources.map((s) => (
                    <div key={s.id}>
                      <dt>{s.label}</dt>
                      <dd>{t('explore.guide.sourceRow', { grain: s.grain })}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section>
                <h2>{t('explore.guide.keysHead')}</h2>
                <table className="keys">
                  <tbody>
                    {(
                      [
                        ['Ctrl+Z', 'explore.ws.undo'],
                        ['Ctrl+Shift+Z', 'explore.ws.redo'],
                        ['?', 'explore.guide.key.help'],
                        ['Tab', 'explore.guide.key.tab'],
                        ['Enter', 'explore.guide.key.enter'],
                        ['Esc', 'explore.guide.key.esc'],
                      ] as const
                    ).map(([k, label]) => (
                      <tr key={k}>
                        <th scope="row">
                          <kbd>{k}</kbd>
                        </th>
                        <td>{t(label)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2>{t('explore.guide.about.docsHead')}</h2>
                <p>{t('explore.guide.about.docsNote')}</p>
                <table className="keys docs">
                  <tbody>
                    {KINDS.map((k) => (
                      <tr key={k}>
                        <th scope="row">{t(`explore.guide.about.kind.${k}`)}</th>
                        <td>{years(k).join(', ') || t('explore.guide.about.none')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section>
                <h2>{t('explore.guide.about.moneyHead')}</h2>
                <dl className="defs">
                  {KINDS.map((k) => (
                    <div key={k}>
                      <dt>{t(`explore.guide.about.money.${k}Term`)}</dt>
                      <dd>{t(`explore.guide.about.money.${k}`)}</dd>
                    </div>
                  ))}
                </dl>
                <p>{t('explore.guide.about.never')}</p>
              </section>
              <section>
                <h2>{t('explore.guide.about.draftHead')}</h2>
                <p>
                  {t('explore.guide.about.draft')} {t(anyDraft ? 'explore.guide.about.draftHere' : 'explore.guide.about.draftNone')}
                </p>
              </section>
              <section>
                <h2>{t('explore.guide.about.caveatsHead')}</h2>
                <ul className="howto">
                  {CAVEATS.map((k) => (
                    <li key={k}>{t(`explore.guide.about.caveat.${k}`)}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h2>{t('explore.guide.about.linksHead')}</h2>
                <ul className="links">
                  <li>
                    <LocaleLink href="/learn/aip-vs-annual-budget">{t('explore.guide.about.link.aipVsAnnual')}</LocaleLink>
                  </li>
                  <li>
                    <LocaleLink href="/learn/glossary">{t('explore.guide.about.link.glossary')}</LocaleLink>
                  </li>
                  <li>
                    <LocaleLink href="/developers">{t('explore.guide.about.link.openData')}</LocaleLink>
                  </li>
                </ul>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
