import type { Metadata } from 'next';
import Link from 'next/link';
import { canonical } from '@/lib/seo';

// ponytail: placeholder until the docs exist; noindex and out of the sitemap so
// search engines don't list an empty page.
export const metadata: Metadata = {
  title: "Documentation | People's Budget Portal",
  alternates: { canonical: canonical('/developers/documentation') },
  robots: { index: false },
};

export default function DocumentationPage() {
  return (
    <>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
        Coming soon
      </p>
      <p className="mt-5 text-[0.9375rem] leading-7 text-ink-muted">
        Guides for setting up and running the portal are being written. Until
        then, the{' '}
        <Link
          href="/developers/open-data#api"
          className="underline decoration-rule underline-offset-4 hover:text-ink"
        >
          open data API
        </Link>{' '}
        is described on the Open data page.
      </p>
    </>
  );
}
