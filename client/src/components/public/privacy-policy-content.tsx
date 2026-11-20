import {
  Info,
  Eye,
  Share2,
  Lock,
  Database,
  UserCheck,
  Mail,
  GitBranch,
  RefreshCw,
  AlertTriangle,
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



export async function PrivacyPolicyContent() {
  const brand = await getBrand();
  const siteHost = SITE_URL.replace(/^https?:\/\//, '');
  const address = brand.address.join(', ') || '—';
  const email = brand.contactEmail ?? '—';
  const venue = [brand.placeName, brand.province, 'Philippines'].filter(Boolean).join(', ');
  return (
    <PolicyPage
      eyebrow={`Legal · ${brand.government}`}
      title="Privacy Policy"
      accent={VISIONS[7].color}
      lede={
        <p>
          How this portal handles personal information — what it collects, why, how
              long it keeps it, and the rights you have over it.
        </p>
      }
      meta={
        <>
          {brand.legalEffective ? `Effective ${brand.legalEffective}` : 'Template, not yet in effect'} · Version {VERSION} · Republic Act No. 10173
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
            The <strong>{brand.government}</strong> (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) respects your privacy and is committed to protecting personal data
            in accordance with Republic Act No. 10173, the Data Privacy Act of 2012, its
            Implementing Rules and Regulations, and other applicable privacy and data protection
            laws.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            This Privacy Policy explains how we collect, use, store, share, and protect personal
            data when you visit{' '}
            <Link
              href={SITE_URL}
              className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
            >
              {siteHost}
            </Link>
            , browse budget proposals, submit feedback, or interact with the portal&apos;s
            features.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            By using this portal, you acknowledge that you have read and understood this Privacy
            Policy.
          </p>
        </div>

        <PolicySections>
          {/* 1. Who We Are */}
          <SectionCard id="who-we-are" number="1" title="Who We Are (Data Controller)" icon={Info}>
            <p className="mb-4">
              The <strong>{brand.government}</strong> is your Personal Information Controller
              (PIC) under RA 10173.
            </p>
            <DataTable
              headers={['Field', 'Details']}
              rows={[
                ['Government Unit', brand.government],
                ['Address', address],
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
                ['Email', email],
              ]}
            />
          </SectionCard>

          {/* 2. Data We Collect */}
          <SectionCard
            id="data-collected"
            number="2"
            title="Personal Data We Collect"
            icon={Database}
          >
            <p className="mb-6">
              We collect only the personal data necessary for legitimate portal operation, public
              participation, communication, security, and compliance purposes.
            </p>

            <h3 className="mb-3 font-semibold text-ink">
              2.1 Information You Provide Voluntarily
            </h3>
            <p className="mb-3">
              When you submit feedback through the portal (on a specific program, project activity,
              or through the general feedback dialog):
            </p>
            <DataTable
              headers={['Field', 'Required?', 'Purpose']}
              rows={[
                [
                  'Full name',
                  <span key="opt1" className="text-ink-faint">Optional</span>,
                  'To identify the sender in feedback records',
                ],
                [
                  'Email address',
                  <span key="opt2" className="text-ink-faint">Optional</span>,
                  'To respond to inquiries; providing an email does not guarantee a response',
                ],
                [
                  'Message / feedback content',
                  <span key="req1" className="font-medium text-red-600">Required</span>,
                  'To process and consider public input on budget proposals',
                ],
                [
                  'Category (General / Suggestion / Concern / Specific PPA / Other)',
                  <span key="opt3" className="text-ink-faint">Optional</span>,
                  'To route and organize feedback appropriately',
                ],
                [
                  'Sentiment (Support / Neutral / Oppose)',
                  <span key="opt4" className="text-ink-faint">Optional</span>,
                  'To measure aggregate public response to specific programs or project activities',
                ],
              ]}
            />
            <p className="mt-3 text-xs text-ink-faint">
              We do not accept file or media uploads through the feedback form.
            </p>

            <h3 className="mb-3 mt-7 font-semibold text-ink">
              2.2 Information Collected Automatically
            </h3>
            <p className="mb-3">When you visit the portal, we automatically collect:</p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>Pages visited</li>
              <li>Date and time of visit</li>
              <li>Referring website or traffic source</li>
              <li>General portal usage data (via Google Analytics 4 — see Section 2.3)</li>
            </ul>

            <h3 className="mb-3 mt-7 font-semibold text-ink">2.3 Cookies</h3>
            <p className="mb-3">
              Public visitors to this portal may receive the following cookies:
            </p>
            <DataTable
              headers={['Cookie', 'Type', 'Purpose', 'Duration']}
              rows={[
                [
                  <code key="ga" className="rounded bg-paper-tint px-1 py-0.5 text-xs">_ga</code>,
                  'Analytics',
                  'Google Analytics 4 — distinguishes unique visitors',
                  '2 years',
                ],
                [
                  <code key="gaid" className="rounded bg-paper-tint px-1 py-0.5 text-xs">_ga_&lt;ID&gt;</code>,
                  'Analytics',
                  'Google Analytics 4 — maintains session state',
                  '2 years',
                ],
                [
                  <code key="rc" className="rounded bg-paper-tint px-1 py-0.5 text-xs">_GRECAPTCHA</code>,
                  'Security (essential)',
                  'Helps Google check that you\'re a real person before you send feedback. Only loads when you open a feedback form.',
                  'Session / 6 months',
                ],
              ]}
            />
            <Note>
              <strong>Google reCAPTCHA:</strong> Our feedback forms use Google reCAPTCHA to block
              spam and automated submissions. This is a security feature that is always active. Because Google processes the check on its end, it is
              covered by{' '}
              <Link
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Google&apos;s Privacy Policy
              </Link>{' '}
              and{' '}
              <Link
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Terms of Service
              </Link>
              .
            </Note>
            <Note>
              <strong>Google Analytics 4:</strong> This portal uses Google Analytics 4 (GA4) to
              understand how visitors use the site. GA4 collects anonymized usage data including
              pages visited, time on page, device type, and approximate geographic location
              (country/city level). This data is processed by Google LLC and is subject to{' '}
              <Link
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Google&apos;s Privacy Policy
              </Link>
              . Analytics cookies are only set after you give consent via the cookie banner at the
              bottom of this page. You can change your preference at any time using the{' '}
              <strong>Cookie Settings</strong> link in the footer.
            </Note>

          </SectionCard>

          {/* 3. How We Use Data */}
          <SectionCard id="how-we-use" number="3" title="How We Use Personal Data" icon={Eye}>
            <DataTable
              headers={['Data Category', 'Purpose']}
              rows={[
                [
                  'Feedback submissions',
                  'To review, aggregate, and consider public input in budget deliberations',
                ],
                [
                  'Technical and usage data',
                  'To monitor portal performance, functionality, and security',
                ],
                [
                  'Analytics data (GA4)',
                  'To understand portal usage patterns and improve public service delivery',
                ],
                [
                  'Security data',
                  'To detect, prevent, and respond to misuse or security incidents',
                ],
                [
                  'Compliance data',
                  'To comply with legal and regulatory obligations under applicable law',
                ],
              ]}
            />
            <p className="mt-4 text-xs text-ink-faint">
              We do not sell your personal data. We do not use it for commercial marketing.
            </p>
          </SectionCard>

          {/* 4. Legal Bases */}
          <SectionCard
            id="legal-bases"
            number="4"
            title="Legal Bases for Processing"
            icon={UserCheck}
          >
            <ul className="space-y-3">
              {[
                {
                  basis: 'Consent',
                  desc: 'When you voluntarily submit feedback or provide contact information through the portal.',
                },
                {
                  basis: 'Legitimate public interest',
                  desc: 'For participatory governance, budget transparency, and analytics used to improve public service delivery.',
                },
                {
                  basis: 'Legal obligation',
                  desc: 'For compliance with applicable laws and regulations, including RA 10173.',
                },
                {
                  basis: 'Protection of rights and interests',
                  desc: 'For portal security, fraud prevention, and safeguarding users against misuse.',
                },
              ].map(({ basis, desc }) => (
                <li key={basis} className="flex gap-3">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ink" />
                  <span>
                    <strong className="text-ink">{basis}</strong> &mdash; {desc}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* 5. Public Nature of Budget Data and Feedback */}
          <SectionCard
            id="public-data"
            number="5"
            title="Public Nature of Budget Data and Feedback"
            icon={Eye}
          >
            <p className="mb-4">
              All budget proposals, programs, project activities, and related government data
              displayed on the portal are public information under applicable transparency and
              accountability laws.
            </p>
            <h3 className="mb-3 font-semibold text-ink">Feedback Visibility</h3>
            <DataTable
              headers={['Submission Type', 'Visibility']}
              rows={[
                [
                  'Program-level or project-activity-level public feedback',
                  'Publicly readable by any portal visitor — no login required',
                ],
                [
                  'General registry feedback (submitted via the "Share Your Feedback" dialog)',
                  'Accessible only to designated local government staff for internal review; not publicly displayed',
                ],
              ]}
            />
            <p className="mt-3 text-xs text-ink-faint">
              Your input may contribute to public records of participatory governance. We will not
              publicly display your email address or other contact details without your explicit
              consent.
            </p>
          </SectionCard>

          {/* 6. Sharing and Disclosure */}
          <SectionCard
            id="sharing"
            number="6"
            title="Sharing and Disclosure"
            icon={Share2}
          >
            <p className="mb-4">
              We may share personal data only when necessary and lawful:
            </p>
            <DataTable
              headers={['Recipient', 'Purpose', 'Data Access']}
              rows={[
                [
                  'Relevant local government offices (the chief executive\'s office, the planning office)',
                  'Budget deliberation and public participation processing',
                  'Relevant submissions only',
                ],
                [
                  'Technical service providers (hosting, maintenance, support)',
                  'Portal operation and security',
                  'Technical and security data only; no access to feedback content unless required for troubleshooting',
                ],
                [
                  'Google LLC',
                  'Analytics via Google Analytics 4',
                  'Anonymized usage data per Google\'s Data Processing Agreement',
                ],
                [
                  'Government authorities or courts',
                  'When required by law',
                  'As legally mandated',
                ],
              ]}
            />
            <p className="mt-3 text-xs text-ink-faint">
              We do not sell personal data to third parties.
            </p>
          </SectionCard>

          {/* 7. Data Security */}
          <SectionCard id="security" number="7" title="Data Security" icon={Lock}>
            <p className="mb-3">
              We implement reasonable organizational, physical, and technical measures to protect
              personal data, including:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-ink-muted">
              <li>Encrypted data transmission (HTTPS) for all portal communications</li>
              <li>
                HttpOnly cookie flags on authentication tokens, preventing client-side script
                access
              </li>
              <li>Role-based access controls limiting who can view submitted feedback</li>
              <li>Regular security monitoring and vulnerability assessments</li>
            </ul>
            <p className="mt-4 text-sm text-ink-muted">
              No system is completely secure. We cannot guarantee absolute security against all
              threats. In the event of a personal data breach that is likely to result in
              undue risk or harm, we will notify the National Privacy Commission and affected
              data subjects as required by law.
            </p>
          </SectionCard>

          {/* 8. Data Retention */}
          <SectionCard id="retention" number="8" title="Data Retention" icon={Database}>
            <DataTable
              headers={['Data Type', 'Retention Period', 'After Retention']}
              rows={[
                [
                  'Feedback and comment submissions',
                  '2 years or until completion of the relevant AIP budget cycle',
                  'Anonymized, aggregated, or deleted',
                ],
                [
                  'Technical and security logs',
                  '6 months',
                  'Deleted unless required for an active investigation',
                ],
                [
                  'Analytics data (Google Analytics 4)',
                  '14 months (GA4 default retention setting)',
                  'Automatically deleted by Google',
                ],
                [
                  'Legal or compliance records',
                  'As required by applicable law',
                  'Archived or deleted per applicable records management policy',
                ],
              ]}
            />
          </SectionCard>

          {/* 9. Your Rights */}
          <SectionCard
            id="your-rights"
            number="9"
            title="Your Rights as a Data Subject"
            icon={UserCheck}
          >
            <p className="mb-4">Under RA 10173, you have the right to:</p>
            <ul className="space-y-2">
              {[
                'Be informed about how your personal data is collected and used',
                'Access personal data we hold about you',
                'Rectify inaccurate or outdated personal data',
                'Request erasure or blocking of your data, when applicable',
                'Object to certain processing activities',
                'Data portability, where technically and legally applicable',
                'File a complaint with the National Privacy Commission',
              ].map((right) => (
                <li key={right} className="flex gap-3">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ink" />
                  <span>{right}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* 10. How to Exercise Your Rights */}
          <SectionCard
            id="exercise-rights"
            number="10"
            title="How to Exercise Your Rights"
            icon={Mail}
          >
            <p className="mb-4">
              To exercise any of your rights under RA 10173, contact our Data Protection Officer:
            </p>
            <DataTable
              headers={['Field', 'Details']}
              rows={[
                ['Office', `${brand.government} — Data Protection Office`],
                ['Email', email],
                ['Phone', brand.contactPhone ?? '—'],
                ['Address', address],
                ['Office Hours', 'Monday – Friday, 8:00 AM – 5:00 PM'],
              ]}
            />
            <p className="mt-4 text-sm text-ink-muted">
              We will acknowledge your request within <strong>five (5) working days</strong> and
              respond fully within <strong>fifteen (15) working days</strong>, or as otherwise
              required by law.
            </p>
          </SectionCard>

          {/* 11. Open Source Nature */}
          <SectionCard
            id="open-source"
            number="11"
            title="Open Source Nature"
            icon={GitBranch}
          >
            <p className="mb-3">
              This portal is built on open-source software (AGPL v3.0) developed by{' '}
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
              While the software code is publicly available, all personal data submitted through
              this portal is isolated to the {brand.government}&apos;s deployment and is not
              shared with other deployments of the same software. Each government unit deploying
              this software is independently responsible for its own data processing and privacy
              compliance.
            </p>
          </SectionCard>

          {/* 12. Changes to This Policy */}
          <SectionCard
            id="changes"
            number="12"
            title="Changes to This Privacy Policy"
            icon={RefreshCw}
          >
            <p className="text-sm text-ink-muted">
              We may update this policy as the portal evolves or as legal requirements change.
              Changes will be posted with a revised Effective Date. Material changes may be
              announced through a notice on the portal. Continued use of the portal after changes
              are posted constitutes acceptance of the updated policy.
            </p>
          </SectionCard>

          {/* 13. Contact Us */}
          <SectionCard id="contact" number="13" title="Contact Us" icon={Mail}>
            <DataTable
              headers={['Field', 'Details']}
              rows={[
                ['Government Unit', brand.government],
                ['Address', address],
                ['Email', email],
                [
                  'Website',
                  <Link
                    key="site2"
                    href={SITE_URL}
                    className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
                  >
                    {siteHost}
                  </Link>,
                ],
              ]}
            />
            <p className="mt-4 text-sm text-ink-muted">
              For unresolved privacy concerns, you may also file a complaint with the{' '}
              <Link
                href="https://www.privacy.gov.ph"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                National Privacy Commission
              </Link>
              {' '}at complaints@privacy.gov.ph or{' '}
              <span className="font-medium">(02) 8234-2228</span>.
            </p>
          </SectionCard>
      </PolicySections>

      <PolicyFooter />
    </PolicyPage>
  );
}
