import { SectionEmpty } from '@/components/public/editorial/section-empty';
import { redirectToNewest } from '@/lib/public-section-page';

/**
 * `/annual` lands on the most recently enacted budget, on its first visible tab, or says
 * that none has been posted yet.
 */
export default async function AnnualIndexPage() {
  await redirectToNewest('annual');
  return <SectionEmpty kind="annual" />;
}
