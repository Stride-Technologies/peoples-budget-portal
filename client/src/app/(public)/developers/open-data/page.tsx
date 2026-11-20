import type { Metadata } from 'next';
import {
  PolicyFooter,
  PolicySection,
  PolicySections,
} from '@/components/public/editorial/policy-page';
import { OutlineRail } from '@/components/public/editorial/outline-rail';
import { apiGetOpenDataCycles, type OpenDataCycleRecord } from '@/lib/api';
import { OG_IMAGES, SITE_URL, canonical } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';
import { goal } from '@/lib/goal-label';
import { LguWord } from '@/components/brand/brand-text';


// Mirrors the PolicySection ids and titles below.
const OUTLINE = [
  { id: 'what', label: 'What you can get' },
  { id: 'years', label: 'Budget years' },
  { id: 'files', label: 'What is in the download' },
  { id: 'api', label: 'For developers: the API' },
  { id: 'freshness', label: 'How often it changes' },
  { id: 'limits', label: 'Limits' },
  { id: 'reuse', label: 'Reusing the data' },
];

export async function generateMetadata(): Promise<Metadata> {
  const { placeName } = await getBrand();
  const title = "Developers and Open Data | People's Budget Portal";
  return {
    title,
    description: `Download ${placeName}'s published budget as open data (CSV and JSON), or read it from code through a free, read-only API.`,
    alternates: { canonical: canonical('/developers/open-data') },
    openGraph: {
      title,
      description: `${placeName}'s published budget as CSV, JSON and a free, read-only API.`,
      url: canonical('/developers/open-data'),
      images: OG_IMAGES,
    },
  };
}

const API_BASE = `${SITE_URL}/api/v1/open-data`;

const DOCUMENT_LABEL: Record<OpenDataCycleRecord['document'], string> = {
  AIP: 'Annual Investment Program',
  ANNUAL_BUDGET: 'Annual Budget',
};

const FILES: Array<[string, string]> = [
  ['programs.csv', `One row per program: its code, office, sector, ${goal}, proposed budget and the split between Personal Services, MOOE, Financial Expenses and Capital Outlay.`],
  ['project-activities.csv', 'The projects and activities under each program. program_id points to the program; parent_activity_id to the project an activity sits under.'],
  ['funds.csv', 'Which funds pay for each program or activity (General Fund, Special Health Fund, and so on), with amounts where the money is split by fund.'],
  ['climate-tags.csv', 'Spending tagged as climate change adaptation or mitigation, one row per climate code.'],
  ['projects.csv', 'Published procurement projects (PPMP), with their office and total.'],
  ['<lgu>-budget-<year>.json', 'The same data nested: each program with its activities, funds and climate tag inside it.'],
  ['METADATA.md', 'What the files are, when the data is from, and a dictionary of every column.'],
];

const ENDPOINTS: Array<[string, string]> = [
  ['GET /cycles', 'Every budget year, and whether it is open'],
  ['GET /cycles/{year}', 'Counts and totals for one year'],
  ['GET /cycles/{year}/programs', 'Programs, 100 a page (filters: office, sector, finishLine, code; page, limit up to 500)'],
  ['GET /cycles/{year}/programs/{id}', 'One program with its activities, funds and climate tag'],
  ['GET /cycles/{year}/programs/{id}/versions', 'Its published versions, newest first'],
  ['GET /cycles/{year}/programs/{id}/versions/{n}', 'One earlier published version'],
  ['GET /cycles/{year}/projects', 'Published procurement projects'],
  ['GET /cycles/{year}/bundle.zip', 'The whole year as one zip'],
  ['GET /reference/{list}', 'offices, finish-lines, pap-sectors, ccet-codes, fund-sources'],
  ['?document=aip or ?document=annual', 'On any /cycles/{year} route: the proposal or the enacted budget, for a year that has both'],
];

const CURL_EXAMPLE = `curl "${API_BASE}/cycles"
curl "${API_BASE}/cycles/2026/programs?office=CHO&limit=50"`;

const FETCH_EXAMPLE = `const res = await fetch(
  "${API_BASE}/cycles/2026/programs?limit=500"
);
const { data, total } = await res.json();
// Money is text with two decimals ("32235000.00"): use a decimal
// library, not floating point, if you add amounts up.`;

const dateFormat = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'long',
  timeZone: 'Asia/Manila',
});

/**
 * One row per download. A year with both an AIP and an enacted budget gets a
 * row and a zip for each; any other year keeps its one stable year URL.
 */
function downloadsOf(cycles: OpenDataCycleRecord[]) {
  return cycles.flatMap((c) =>
    c.open && (c.documents?.length ?? 0) > 1
      ? c.documents!.map((d) => ({ fiscalYear: c.fiscalYear, ...d }))
      : [
          {
            fiscalYear: c.fiscalYear,
            document: c.document,
            dataAsOf: c.dataAsOf,
            bundleUrl: c.open ? c.bundleUrl : null,
          },
        ],
  );
}

async function loadCycles(): Promise<OpenDataCycleRecord[] | null> {
  try {
    return await apiGetOpenDataCycles();
  } catch {
    return null;
  }
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border-y border-rule">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-3 pr-4 font-mono text-[0.625rem] font-normal uppercase tracking-[0.14em] text-ink-faint"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule border-t border-rule">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j} className="py-3 pr-4 align-top text-ink-muted">
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

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-rule bg-paper-tint px-4 py-3 font-mono text-[0.8125rem] leading-6 text-ink">
      <code>{children}</code>
    </pre>
  );
}

export default async function OpenDataPage() {
  const cycles = await loadCycles();

  return (
    <>
      <OutlineRail title="Open data sections" entries={OUTLINE} />
      <PolicySections>
        <PolicySection id="what" number="1" title="What you can get">
          <p>
            For each budget year the <LguWord k="lgu" /> opens, you can download every
            published program with its projects and activities, which funds pay
            for them, how much is tagged as climate spending, and the published
            procurement projects. Amounts are the ones on this site, to the
            centavo.
          </p>
          <p>
            Drafts are never included, and neither is anything about people:
            no feedback, no names, no staff accounts. There is nothing to sign
            up for and no key to ask for.
          </p>
        </PolicySection>

        <PolicySection id="years" number="2" title="Budget years">
          {cycles === null ? (
            <p>
              The list of years could not be loaded right now. Please try again
              in a few minutes.
            </p>
          ) : cycles.length === 0 ? (
            <p>No budget years have been set up yet.</p>
          ) : (
            <Table
              head={['Year', 'Document', 'Download']}
              rows={downloadsOf(cycles).map((c) => [
                <span key="y" className="font-mono tabular-nums text-ink">
                  {c.fiscalYear}
                </span>,
                DOCUMENT_LABEL[c.document],
                c.bundleUrl ? (
                  <span key="d">
                    <a href={c.bundleUrl} download>
                      {c.bundleUrl.split('/').pop()}
                    </a>
                    {c.dataAsOf && (
                      <span className="block text-xs text-ink-faint">
                        Data as of {dateFormat.format(new Date(c.dataAsOf))}
                      </span>
                    )}
                  </span>
                ) : (
                  <span key="d" className="text-ink-faint">
                    Coming soon
                  </span>
                ),
              ])}
            />
          )}
          <p>
            A year becomes available when the <LguWord k="lgu" /> decides to open it. Until
            then it reads &ldquo;Coming soon&rdquo;.
          </p>
        </PolicySection>

        <PolicySection id="files" number="3" title="What is in the download">
          <p>
            One zip per year, or one per document for a year that has both a
            proposal and an enacted budget. The CSV files open in Excel, Google Sheets or
            LibreOffice; accented names such as Peñafrancia display correctly.
          </p>
          <Table
            head={['File', 'What it holds']}
            rows={FILES.map(([file, what]) => [
              <code key="f" className="font-mono text-[0.8125rem] text-ink">
                {file}
              </code>,
              what,
            ])}
          />
          <p>
            <strong>How the tables join:</strong> activities point to their
            program by <code>program_id</code>; funds and climate tags point to a
            program or an activity by <code>row_type</code> and{' '}
            <code>row_id</code>. Join on <code>id</code>, not on the AIP code,
            which can change when an office reorders its programs. A
            program&apos;s <code>proposed_total</code> is its figure: do not add
            its activities on top.
          </p>
        </PolicySection>

        <PolicySection id="api" number="4" title="For developers: the API">
          <p>
            Base address: <code className="break-all">{API_BASE}</code>. It is
            read-only, needs no key, answers JSON, and can be called from a web
            page on any domain.
          </p>
          <Table
            head={['Endpoint', 'Returns']}
            rows={ENDPOINTS.map(([path, what]) => [
              <code key="p" className="whitespace-nowrap font-mono text-[0.8125rem] text-ink">
                {path}
              </code>,
              what,
            ])}
          />
          <p>From a terminal:</p>
          <Code>{CURL_EXAMPLE}</Code>
          <p>From JavaScript:</p>
          <Code>{FETCH_EXAMPLE}</Code>
          <p>
            A year that is not open answers <code>404</code>. Field names and
            types will not change in this version (<code>v1</code>); new fields
            may be added. A breaking change would ship as <code>v2</code>, with{' '}
            <code>v1</code> kept for at least six months.
          </p>
        </PolicySection>

        <PolicySection id="freshness" number="5" title="How often it changes">
          <p>
            When an office publishes a change, the download and the API show it
            within five minutes. Each year shows the date of its newest
            published change as &ldquo;data as of&rdquo;, and the zip&apos;s{' '}
            <code>METADATA.md</code> repeats it.
          </p>
        </PolicySection>

        <PolicySection id="limits" number="6" title="Limits">
          <p>
            The API limits how often one address can call it, so it stays fast
            for everyone. If you want everything, download the zip instead of 
            paging through the API.
          </p>
        </PolicySection>

        <PolicySection id="reuse" number="7" title="Reusing the data">
          <p>
            The terms for reusing the data, and how to credit the <LguWord k="lgu" />, will be
            set out in an open data policy. It is coming soon.
          </p>
        </PolicySection>
      </PolicySections>
      <PolicyFooter />
    </>
  );
}
