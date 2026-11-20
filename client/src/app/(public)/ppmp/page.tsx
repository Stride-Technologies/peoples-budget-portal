import { SectionEmpty } from '@/components/public/editorial/section-empty';
import { redirectToNewest } from '@/lib/public-section-page';

/** `/ppmp` opens the newest year, on its first visible tab, or says that none has been posted yet. */
export default async function PpmpIndexPage() {
  await redirectToNewest('ppmp');
  return <SectionEmpty kind="ppmp" />;
}
