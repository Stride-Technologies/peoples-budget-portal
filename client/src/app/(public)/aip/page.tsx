import { SectionEmpty } from '@/components/public/editorial/section-empty';
import { redirectToNewest } from '@/lib/public-section-page';

/**
 * `/aip` lands on the newest cycle still in preparation, on its first visible tab (Overview,
 * or Browse while the Overview is switched off), or says that none has been posted yet.
 *
 * `next.config.ts` keeps a narrower redirect for the `/aip/<uuid>` program links that predate
 * this section.
 */
export default async function AipIndexPage() {
  await redirectToNewest('aip');
  return <SectionEmpty kind="aip" />;
}
