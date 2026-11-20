import type { Metadata } from 'next';
import Link from 'next/link';
import { SourceLink } from '@/components/public/source-link';
import {
  PolicyFooter,
  PolicySection,
  PolicySections,
} from '@/components/public/editorial/policy-page';
import { OutlineRail } from '@/components/public/editorial/outline-rail';
import { OG_IMAGES, canonical } from '@/lib/seo';

// Mirrors the PolicySection ids and titles below.
const OUTLINE = [
  { id: 'open-source', label: 'Free for all LGUs and agencies' },
  { id: 'repository', label: 'The repository' },
  { id: 'licence', label: 'Licence' },
  { id: 'who', label: 'Who builds it' },
];

export const metadata: Metadata = {
  title: "Source Code | People's Budget Portal",
  description:
    "The People's Budget Portal is free and open-source software under the GNU AGPL v3, for any local government or people's council to adopt.",
  alternates: { canonical: canonical('/developers/source-code') },
  openGraph: {
    title: "Source Code | People's Budget Portal",
    description:
      "Free and open-source software under the GNU AGPL v3, for any local government or people's council to adopt.",
    url: canonical('/developers/source-code'),
    images: OG_IMAGES,
  },
};

export default function SourceCodePage() {
  return (
    <>
      <OutlineRail title="Source code sections" entries={OUTLINE} />
      <PolicySections>
        <PolicySection id="open-source" number="1" title="Free for all LGUs and agencies">
          <p>
            Intended for use under free and open source principles, so other
            local governments and people&apos;s councils can adopt it to promote
            transparency, participation and accountability in public budgeting.
          </p>
        </PolicySection>

        <PolicySection id="repository" number="2" title="The repository">
          <p>
            The code is published in full. If this site runs a changed copy, the link below goes to
            that copy.
          </p>
          <p>
            <SourceLink label="View the source code" />
          </p>
        </PolicySection>

        <PolicySection id="licence" number="3" title="Licence">
          <p>
            The portal is licensed under the GNU Affero General Public License
            version 3. Anyone may run it, change it and share it, on the
            condition that they pass the same freedom on. What that means in
            practice is on the <Link href="/license">licence page</Link>.
          </p>
        </PolicySection>

        <PolicySection id="who" number="4" title="Who builds it">
          <p>
            Led by{' '}
            <a href="https://www.wesolve.ph/" target="_blank" rel="noopener noreferrer">
              WeSolve Foundation
            </a>
            , developed by{' '}
            <a href="https://www.stridetech.ph/" target="_blank" rel="noopener noreferrer">
              Stride Technologies
            </a>
            , and supported by the civic technology movement{' '}
            <a href="https://bettergov.ph/" target="_blank" rel="noopener noreferrer">
              BetterGov.PH
            </a>
            . It was first built in partnership with the City Government of Naga and the
            Naga City People&rsquo;s Council.
          </p>
        </PolicySection>
      </PolicySections>
      <PolicyFooter />
    </>
  );
}
