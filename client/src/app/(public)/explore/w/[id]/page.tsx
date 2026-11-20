import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocaleLink } from '@/components/i18n/locale-link';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { WorkspaceGate } from '@/components/explore/workspace/workspace-gate';
import { getT } from '@/i18n/server';
import { apiExploreCapabilities, apiExploreCatalogue, apiExploreSnapshot, apiExploreSources } from '@/lib/api';
import { EXPLORER_ENABLED } from '@/lib/explore/view-url';
import { OG_IMAGES } from '@/lib/seo';

type Params = Promise<{ id: string }>;

/** A share link is a copy of someone's workbook: never indexed (W20). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const title = t('explore.ws.sharedTitle');
  return { title, robots: { index: false, follow: false }, openGraph: { images: OG_IMAGES, title } };
}

/**
 * `/explore/w/<id>` (specs/018 redesign P3, W9): opens a shared workbook as a
 * copy in this browser, then the address becomes `/explore`. Below desktop
 * width there is no workspace yet (W19), so it points to the explorer.
 */
export default async function SharedWorkbookPage({ params }: { params: Params }) {
  if (!EXPLORER_ENABLED) notFound();
  const { id } = await params;
  const [t, shared, catalogue, sources, caps] = await Promise.all([
    getT(),
    apiExploreSnapshot(id).catch(() => null),
    apiExploreCatalogue().catch(() => null),
    apiExploreSources().then((r) => r.sources).catch(() => null),
    apiExploreCapabilities().catch(() => null),
  ]);
  if (!shared || !catalogue || !sources) notFound();
  return (
    <EditorialPage>
      <WorkspaceGate catalogue={catalogue} sources={sources} capabilities={caps} incoming={shared.workbook} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-ink lg:hidden">
        <p>{t('explore.ws.desktopOnly')}</p>
        <LocaleLink href="/explore" className="underline underline-offset-2">
          {t('explore.ws.openExplorer')}
        </LocaleLink>
      </div>
    </EditorialPage>
  );
}
