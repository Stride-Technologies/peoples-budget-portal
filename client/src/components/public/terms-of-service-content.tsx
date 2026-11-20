import {
  CheckCircle,
  Monitor,
  ShieldCheck,
  MessageSquare,
  BookOpen,
  AlertTriangle,
  Scale,
  GitBranch,
  Globe,
  RefreshCw,
  Mail,
} from 'lucide-react';
import Link from 'next/link';
import {
  PolicyPage,
  PolicySection,
  PolicySections,
  PolicyFooter,
} from '@/components/public/editorial/policy-page';
import { VISIONS } from '@/lib/finish-lines';
import { getBrand } from '@/lib/brand-server';
import { SITE_URL } from '@/lib/seo';
import { LguWord } from '@/components/brand/brand-text';

const VERSION = '1.0';

/**
 * Adapter kept so the ~20 call sites below stay untouched: the shape now comes
 * from `PolicySection`. The `icon` each clause used to carry is dropped — twenty
 * tinted icon tiles down a legal document was decoration competing with the text,
 * and the numbering already tells you where you are.
 */
function SectionCard({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <PolicySection id={id} number={number} title={title}>
      {children}
    </PolicySection>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-paper-tint">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-paper-tint'}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top text-ink-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-sm leading-relaxed text-amber-800">{children}</p>
    </div>
  );
}

export async function TermsOfServiceContent() {
  const brand = await getBrand();
  const siteHost = SITE_URL.replace(/^https?:\/\//, '');
  const address = brand.address.join(', ') || '—';
  const email = brand.contactEmail ?? '—';
  const venue = [brand.placeName, brand.province, 'Philippines'].filter(Boolean).join(', ');
  return (
    <PolicyPage
      eyebrow={`Legal · ${brand.government}`}
      title="Terms of Service"
      accent={VISIONS[6].color}
      lede={
        <p>
          The terms you accept by using this portal, and the limits of what the
              published figures can be relied on for.
        </p>
      }
      meta={
        <>
          {brand.legalEffective ? `Effective ${brand.legalEffective}` : 'Template, not yet in effect'} · Version {VERSION}
        </>
      }
    >
      {!brand.legalEffective && (
        <p className="mb-10 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          <strong>Template text.</strong> The {brand.government} has not yet reviewed this document or put it
          into effect. It ships with the People&rsquo;s Budget Portal software as a starting point.
        </p>
      )}
        {/* Intro */}
        <div className="mb-10 rounded-2xl border border-rule bg-paper-raised px-8 py-7 shadow-sm">
          <p className="text-sm leading-relaxed text-ink-muted">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the{' '}
            <strong>People&apos;s Budget Portal</strong> (&ldquo;Portal&rdquo;) operated by the{' '}
            <strong>{brand.government}</strong> (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) and accessible at{' '}
            <Link
              href={SITE_URL}
              className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
            >
              {siteHost}
            </Link>
            .
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            By accessing or using this Portal — whether to view published budget proposals, submit
            public feedback, or perform official local government functions — you agree to be bound
            by these Terms. If you do not agree, please discontinue use of the Portal immediately.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            These Terms should be read together with our{' '}
            <Link
              href="/privacy-policy"
              className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
            >
              Privacy Policy
            </Link>
            , which explains how we handle personal data collected through the Portal.
          </p>
        </div>

        <PolicySections>
          {/* 1. Acceptance of Terms */}
          <SectionCard
            id="acceptance"
            number="1"
            title="Acceptance of Terms"
            icon={CheckCircle}
          >
            <p className="mb-3">
              Access to and use of this Portal constitutes your acceptance of these Terms, effective
              as of the date you first access the Portal. These Terms apply to:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>
                <strong>Public visitors</strong> who view published Annual Investment Program (AIP)
                data and submit public feedback
              </li>
              <li>
                <strong>Local government staff</strong> (office heads, budget reviewers, administrators)
                who use the Portal to submit, review, or approve programs and project activities
              </li>
              <li>
                <strong>All other users</strong> who access any part of the Portal
              </li>
            </ul>
            <p className="mt-4">
              Minors under eighteen (18) years of age must have the consent of a parent or legal
              guardian before submitting any feedback or personal information through the Portal.
            </p>
          </SectionCard>

          {/* 2. Description of the Portal */}
          <SectionCard
            id="description"
            number="2"
            title="Description of the Portal"
            icon={Monitor}
          >
            <p className="mb-4">
              The People&apos;s Budget Portal is an official transparency and participatory governance
              platform of the {brand.government}. It provides:
            </p>
            <DataTable
              headers={['Feature', 'Available To']}
              rows={[
                [
                  'Public viewing of approved Annual Investment Program (AIP) data — programs, project activities, funding sources, and budget ceilings',
                  'All visitors (no account required)',
                ],
                [
                  'Public feedback submission on specific programs, project activities, or the AIP registry in general',
                  'All visitors (no account required)',
                ],
                [
                  'Program and project activity submission and workflow management',
                  'Authorized local government staff with portal accounts',
                ],
                [
                  'AIP review, endorsement, and approval workflows',
                  'Authorized local government staff with designated roles',
                ],
                [
                  'Budget reports and exports',
                  'Authorized local government staff with portal accounts',
                ],
              ]}
            />
          </SectionCard>

          {/* 3. Permitted Use */}
          <SectionCard
            id="permitted-use"
            number="3"
            title="Permitted and Prohibited Use"
            icon={ShieldCheck}
          >
            <h3 className="mb-3 font-semibold text-ink">3.1 Permitted Use</h3>
            <p className="mb-3">You may use the Portal solely for lawful purposes, including:</p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>Viewing publicly available AIP budget data</li>
              <li>Submitting genuine, good-faith feedback on budget proposals</li>
              <li>
                Performing your official duties as an authorized local government staff member (if
                applicable)
              </li>
              <li>Research and civic education consistent with applicable law</li>
            </ul>

            <h3 className="mb-3 mt-6 font-semibold text-ink">3.2 Prohibited Use</h3>
            <p className="mb-3">You must not:</p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>
                Submit false, misleading, harassing, defamatory, obscene, or malicious content
              </li>
              <li>
                Impersonate any person, office, or government entity, or misrepresent your
                affiliation with the {brand.government}
              </li>
              <li>
                Attempt to gain unauthorized access to restricted areas of the Portal or to other
                users&apos; accounts
              </li>
              <li>
                Interfere with, disrupt, or overload the Portal&apos;s infrastructure or security
                measures
              </li>
              <li>
                Upload or transmit malware, viruses, or any other harmful code
              </li>
              <li>
                Circumvent or attempt to circumvent reCAPTCHA or other anti-spam mechanisms
              </li>
              <li>
                Use the Portal in any manner that violates applicable Philippine law or regulations,
                including but not limited to the Cybercrime Prevention Act of 2012 (RA 10175)
              </li>
            </ul>
            <Note>
              Violations of the prohibited use provisions may result in suspension or termination
              of access and may be referred to appropriate authorities.
            </Note>
          </SectionCard>

          {/* 4. Feedback Submissions */}
          <SectionCard
            id="feedback"
            number="4"
            title="Feedback Submissions"
            icon={MessageSquare}
          >
            <p className="mb-4">
              The Portal allows public visitors to submit feedback on budget programs, project
              activities, and the AIP registry. By submitting feedback, you agree that:
            </p>
            <ul className="space-y-2">
              {[
                'Your feedback is your own genuine, good-faith opinion and does not infringe on the rights of any third party.',
                `The ${brand.government} may use, reproduce, display, and incorporate your feedback into budget deliberations and public records.`,
                'Program-level and project-activity-level feedback may be publicly visible to other portal visitors.',
                'General registry feedback is reviewed internally by authorized local government staff and is not publicly displayed.',
                'We reserve the right to remove any feedback that violates these Terms, contains prohibited content, or is determined to be spam or submitted in bad faith.',
                'Providing contact information (name, email) is optional. If provided, you consent to us using that information solely to follow up on your feedback.',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ink" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ink-faint">
              See our{' '}
              <Link
                href="/privacy-policy#public-data"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                Privacy Policy §5
              </Link>{' '}
              for details on feedback visibility and data handling.
            </p>
          </SectionCard>

          {/* 5. Intellectual Property */}
          <SectionCard
            id="intellectual-property"
            number="5"
            title="Intellectual Property"
            icon={BookOpen}
          >
            <h3 className="mb-3 font-semibold text-ink">6.1 Government Content</h3>
            <p className="mb-4">
              All government data, reports, budget documents, official logos, seals, and other
              materials published on this Portal are owned by or licensed to the {brand.government}. Reproduction or redistribution for non-commercial, civic, or journalistic
              purposes is permitted provided that the source is properly attributed to the
              {brand.government} and the content is not altered in a materially misleading way.
            </p>

            <h3 className="mb-3 font-semibold text-ink">6.2 Portal Software</h3>
            <p className="mb-4">
              The Portal is built on open-source software licensed under the GNU Affero General
              Public License v3.0 (AGPL-3.0), developed by{' '}
              <Link
                href="https://www.wesolve.ph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                WeSolve Foundation Inc.
              </Link>{' '}
              and{' '}
              <Link
                href="https://www.stridetech.ph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                Stride Technologies Corp.
              </Link>
              . The source code is publicly available in accordance with the AGPL-3.0 license. The
              open-source nature of the software does not grant rights to government data or content
              published through the Portal.
            </p>

            <h3 className="mb-3 font-semibold text-ink">6.3 Third-Party Services</h3>
            <p>
              This Portal integrates third-party services including Google reCAPTCHA and Google
              Analytics 4. Their respective trademarks, logos, and intellectual property remain
              the property of their respective owners and are governed by their own terms.
            </p>
          </SectionCard>

          {/* 6. Disclaimer of Warranties */}
          <SectionCard
            id="disclaimer"
            number="6"
            title="Disclaimer of Warranties"
            icon={AlertTriangle}
          >
            <p className="mb-4">
              The Portal is provided on an <strong>&ldquo;as is&rdquo;</strong> and{' '}
              <strong>&ldquo;as available&rdquo;</strong> basis. The {brand.government} makes
              no representations or warranties of any kind, express or implied, including but not
              limited to:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>
                The accuracy, completeness, or currency of any budget data, program information, or
                other content published on the Portal
              </li>
              <li>
                Uninterrupted or error-free access to the Portal
              </li>
              <li>
                The absence of viruses or other harmful components in Portal content
              </li>
              <li>
                Fitness for a particular purpose or non-infringement
              </li>
            </ul>
            <Note>
              Budget data displayed on this Portal reflects the AIP as submitted and/or approved
              at the time of publication. Figures are subject to change through the official LFC and{' '}
              <LguWord k="council" /> processes. For legally binding or audit-grade figures, consult
              the <LguWord k="LguAdj" /> Budget Office directly.
            </Note>
          </SectionCard>

          {/* 7. Limitation of Liability */}
          <SectionCard
            id="liability"
            number="7"
            title="Limitation of Liability"
            icon={Scale}
          >
            <p className="mb-4">
              To the fullest extent permitted by applicable law, the {brand.government}, its
              officers, employees, and authorized representatives shall not be liable for any:
            </p>
            <DataTable
              headers={['Type of Damage', 'Examples']}
              rows={[
                [
                  'Direct damages',
                  'Losses arising directly from reliance on inaccurate Portal data',
                ],
                [
                  'Indirect or consequential damages',
                  'Loss of business, profits, data, or goodwill',
                ],
                [
                  'Incidental damages',
                  'Costs incurred due to Portal downtime or service interruptions',
                ],
                [
                  'Damages from third-party services',
                  'Issues arising from Google Analytics, reCAPTCHA, or other integrated services',
                ],
              ]}
            />
            <p className="mt-4 text-sm text-ink-muted">
              This limitation applies regardless of the legal theory under which the claim is
              brought and whether or not the {brand.government} has been advised of the
              possibility of such damages.
            </p>
          </SectionCard>

          {/* 8. Indemnification */}
          <SectionCard
            id="indemnification"
            number="8"
            title="Indemnification"
            icon={ShieldCheck}
          >
            <p className="mb-3">
              You agree to defend, indemnify, and hold harmless the {brand.government} and
              its officers, employees, and authorized representatives from and against any claims,
              liabilities, damages, losses, and expenses (including reasonable legal fees) arising
              from or in connection with:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>Your violation of these Terms</li>
              <li>Your use or misuse of the Portal</li>
              <li>Content you submit through the Portal that infringes any third-party right</li>
              <li>
                Your violation of any applicable law or regulation
              </li>
            </ul>
          </SectionCard>

          {/* 9. Open Source Nature */}
          <SectionCard
            id="open-source"
            number="9"
            title="Open Source Nature"
            icon={GitBranch}
          >
            <p className="mb-3">
              This Portal is built on open-source software (AGPL v3.0) developed by{' '}
              <Link
                href="https://www.wesolve.ph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                WeSolve Foundation Inc.
              </Link>{' '}
              and{' '}
              <Link
                href="https://www.stridetech.ph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                Stride Technologies Corp.
              </Link>
              . It was first built in partnership with the City Government of Naga and the
              Naga City People&apos;s Council.
            </p>
            <p className="text-sm text-ink-muted">
              While the software code is publicly available, each government unit deploying this
              software is independently responsible for ensuring its own compliance with these Terms
              and all applicable laws. The availability of the source code does not affect the
              enforceability of these Terms with respect to this deployment.
            </p>
          </SectionCard>

          {/* 10. Governing Law */}
          <SectionCard
            id="governing-law"
            number="10"
            title="Governing Law and Jurisdiction"
            icon={Globe}
          >
            <p className="mb-3">
              These Terms are governed by and construed in accordance with the laws of the
              <strong> Republic of the Philippines</strong>, without regard to its conflict-of-law
              provisions.
            </p>
            <p className="mb-3">
              Any dispute arising from or in connection with these Terms or your use of the Portal
              shall be subject to the exclusive jurisdiction of the appropriate courts of{' '}
              <strong>{venue}</strong>.
            </p>
            <p className="text-sm text-ink-muted">
              Relevant laws include, but are not limited to: Republic Act No. 10175 (Cybercrime
              Prevention Act of 2012), Republic Act No. 10173 (Data Privacy Act of 2012), Republic
              Act No. 11032 (Ease of Doing Business Act), and applicable local government code
              provisions.
            </p>
          </SectionCard>

          {/* 11. Changes to Terms */}
          <SectionCard
            id="changes"
            number="11"
            title="Changes to These Terms"
            icon={RefreshCw}
          >
            <p className="mb-3">
              The {brand.government} reserves the right to modify these Terms at any time.
              When changes are made, the revised Terms will be posted on this page with an updated
              Effective Date. Material changes may be announced through a notice on the Portal.
            </p>
            <p className="text-sm text-ink-muted">
              Your continued access to or use of the Portal after any changes to these Terms
              constitutes your acceptance of the revised Terms. It is your responsibility to review
              these Terms periodically for updates.
            </p>
          </SectionCard>

          {/* 12. Contact Us */}
          <SectionCard id="contact" number="12" title="Contact Us" icon={Mail}>
            <p className="mb-4">
              For questions, concerns, or requests related to these Terms, please reach out to:
            </p>
            <DataTable
              headers={['Field', 'Details']}
              rows={[
                ['Government Unit', brand.government],
                ['Office', 'Budget Office / Information Technology Office'],
                ['Address', address],
                ['Email', email],
                [
                  'Website',
                  <Link
                    key="site"
                    href={SITE_URL}
                    className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
                  >
                    {siteHost}
                  </Link>,
                ],
                ['Office Hours', 'Monday – Friday, 8:00 AM – 5:00 PM'],
              ]}
            />
          </SectionCard>
      </PolicySections>

      <PolicyFooter />
    </PolicyPage>
  );
}
