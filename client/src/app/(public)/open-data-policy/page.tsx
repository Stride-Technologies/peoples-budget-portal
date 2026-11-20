import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '@/components/public/editorial/policy-page';
import { VISIONS } from '@/lib/finish-lines';
import { canonical } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

// ponytail: placeholder until the City adopts the policy. The full draft (what
// is published, what never is, CC BY 4.0, how to credit) is in git at ae3131e;
// restore it from there, drop the noindex and re-add it to the sitemap.
export const metadata: Metadata = {
  title: "Open Data Policy | People's Budget Portal",
  alternates: { canonical: canonical('/open-data-policy') },
  robots: { index: false },
};

export default async function OpenDataPolicyPage() {
  const brand = await getBrand();
  return (
    <PolicyPage
      eyebrow={`Open data · ${brand.government}`}
      title="Open Data Policy"
      accent={VISIONS[5].color}
      lede={
        <p>
          The terms for reusing {brand.shortName}&apos;s published budget data, and how to
          credit it, are being finalised with the {brand.government}.
        </p>
      }
      meta={<>Coming soon</>}
    >
      <p className="text-[0.9375rem] leading-7 text-ink-muted">
        Meanwhile, what is shared and how to get it is on the{' '}
        <Link
          href="/developers/open-data"
          className="underline decoration-rule underline-offset-4 hover:text-ink"
        >
          Open data
        </Link>{' '}
        page.
      </p>
    </PolicyPage>
  );
}
