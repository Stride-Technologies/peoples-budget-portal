"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PolicyPage,
  PolicyFooter,
} from "@/components/public/editorial/policy-page";
import { VISIONS, readableOn } from "@/lib/finish-lines";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useBrand } from '@/components/brand/brand-provider';
import { SourceLink } from '@/components/public/source-link';

const PERMISSIONS = [
  { label: "Commercial use", description: "May be used for commercial purposes." },
  { label: "Distribution", description: "May be distributed to anyone." },
  { label: "Modification", description: "May be modified freely." },
  { label: "Patent use", description: "Grants rights to any contributor's patents." },
  { label: "Private use", description: "May be used and modified privately." },
];

const CONDITIONS = [
  {
    label: "Disclose source",
    description: "Source code must be made available when distributing.",
  },
  {
    label: "License & copyright notice",
    description: "A copy of the license and copyright notice must be included.",
  },
  {
    label: "Network use is distribution",
    description:
      "Users who interact with the software over a network must be able to receive the source. This is the key AGPL addition over GPL.",
  },
  {
    label: "Same license",
    description: "Modifications must be released under the same license.",
  },
  {
    label: "State changes",
    description: "Changes made to the code must be documented.",
  },
];

const LIMITATIONS = [
  {
    label: "Liability",
    description: "The license includes a limitation of liability.",
  },
  {
    label: "Warranty",
    description: "The license explicitly states it does not provide a warranty.",
  },
];

export function LicensePage({ licenseText }: { licenseText: string }) {
  const [fullTextOpen, setFullTextOpen] = useState(false);
  const brand = useBrand();

  return (
    <PolicyPage
      eyebrow={`Open source · ${brand.government}`}
      title="Licence"
      accent={VISIONS[1].color}
      lede={
        <p>
          This portal is free and open-source software. Any local government or
          people&rsquo;s council may take it, run it, and change it — on the
          condition that they pass the same freedom on.
        </p>
      }
      meta={<>GNU Affero General Public License, Version 3</>}
    >
        {/* This Project */}
        <section className="mb-14 overflow-hidden rounded-2xl border border-rule bg-paper-raised">
          <div className="border-b border-rule bg-paper-tint px-8 py-5">
            <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-ink">This Project</h2>
          </div>
          <div className="px-8 py-7">
            <p className="text-sm leading-relaxed text-ink-muted">
              The <span className="font-medium text-ink">People&apos;s Budget Portal</span> is
              free and open-source software licensed under the{" "}
              <span className="font-medium text-ink">AGPL-3.0</span>. It was built through a
              civic-tech collaboration between{" "}
              <a
                href="https://www.wesolve.ph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                WeSolve Foundation Inc.
              </a>{" "}
              and{" "}
              <a
                href="https://www.stridetech.ph/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
              >
                Stride Technologies Corp.
              </a>
              . It was first built in partnership with the City Government of Naga and
              the Naga City People&apos;s Council.
            </p>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-semibold text-amber-900">
                What AGPL means for a hosted app
              </p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                Unlike standard GPL, AGPL&apos;s network-use clause (§13) means that if you run a
                modified version of this software as a web service, you must make your modified
                source code available to the users of that service — not just when you distribute
                binaries. In short: <em>using it over a network counts as distribution</em>.
              </p>
            </div>

            <div className="mt-6">
              <SourceLink label="View the source code" />
            </div>
          </div>
        </section>

        {/* Summary */}
        <section className="mb-14">
          <h2 className="mb-1 font-display text-[1.75rem] font-medium tracking-[-0.02em] text-ink">License Summary</h2>
          <p className="mb-8 text-sm text-ink-muted">
            A plain-language overview. The full legal text is below.
          </p>

          {/* Three semantic groups — may / must / may not. Colour is load-bearing
              here, so it stays; it is just drawn from the city's own palette
              instead of Tailwind's green/blue/red, and each card carries its
              heading in text as well, so the grouping never rests on hue alone. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {(
              [
                { title: 'You may', items: PERMISSIONS, icon: CheckCircle2, color: VISIONS[1].color },
                { title: 'You must', items: CONDITIONS, icon: AlertCircle, color: VISIONS[7].color },
                { title: 'You may not', items: LIMITATIONS, icon: XCircle, color: VISIONS[0].color },
              ] as const
            ).map(({ title, items, icon: Icon, color }) => (
              <div
                key={title}
                className="rounded-2xl border border-rule bg-paper-raised p-6"
                style={{ borderTopWidth: 3, borderTopColor: color }}
              >
                <div className="mb-5 flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color }} />
                  <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
                    {title}
                  </h3>
                </div>
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li key={item.label}>
                      <p className="text-sm font-medium text-ink">
                        {item.label}
                        {item.label === 'Network use is distribution' && (
                          <span
                            className="ml-2 rounded px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em]"
                            style={{ backgroundColor: color, color: readableOn(color) }}
                          >
                            AGPL
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-ink-muted">
                        {item.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Full license text accordion */}
        <section>
          <button
            onClick={() => setFullTextOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-rule bg-paper-raised px-6 py-4 text-left shadow-sm transition-colors hover:bg-paper-tint"
            aria-expanded={fullTextOpen}
          >
            <span className="font-semibold text-ink">Full License Text</span>
            {fullTextOpen ? (
              <ChevronUp className="h-5 w-5 text-ink-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-ink-muted" />
            )}
          </button>

          {fullTextOpen && (
            <div className="mt-2 rounded-2xl border border-rule bg-paper-raised">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words px-6 py-6 font-mono text-xs leading-relaxed text-ink-muted">
                {licenseText}
              </pre>
            </div>
          )}
        </section>

      <PolicyFooter>
        <p>
          The licence text above is the authoritative document. For the source
          itself, see the repository link on the{' '}
          <Link
            href="/"
            className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            home page
          </Link>
          .
        </p>
      </PolicyFooter>
    </PolicyPage>
  );
}
