/**
 * The words this site uses, in plain language.
 *
 * Scope rule: **a term earns a place here only if a visitor will actually meet it
 * on this site.** The DBM's own glossary runs to a few hundred entries, and a
 * glossary nobody finishes is a glossary nobody reads.
 *
 * Definitions are **paraphrases, not quotations.** Where the DBM Budget
 * Operations Manual for LGUs (2023) defines a term, the paraphrase follows it and
 * `source` says so; the rest are grounded in the manual's body or in this
 * project's own domain reference (`api/docs/aip-reference.md`). For anything you
 * intend to cite, use the official document — that is what `source: 'bom'` is
 * telling you.
 */
import { GOAL } from './goal-label.ts';

export type GlossarySource = 'bom' | 'lgc' | 'lgu' | 'procurement';

export interface GlossaryEntry {
  term: string;
  /** Acronym as it appears on the site, where there is one. */
  short?: string;
  definition: string;
  source: GlossarySource;
}

export interface GlossaryGroup {
  heading: string;
  blurb: string;
  entries: GlossaryEntry[];
}

export const GLOSSARY: GlossaryGroup[] = [
  {
    heading: 'The two documents',
    blurb: 'The distinction this whole site is organized around.',
    entries: [
      {
        term: 'Annual Investment Program',
        short: 'AIP',
        definition:
          "The {lgu}'s plan for one year: everything its offices propose to do, and what they expect it to cost. It is the year's slice of a longer development plan. A plan only — nothing may be spent on the strength of it.",
        source: 'bom',
      },
      {
        term: 'Annual Budget',
        definition:
          'The financial plan for one fiscal year, once the Sanggunian has passed it and the {Mayor} has signed it. This is the document that authorizes spending, and the reason the enacted year on this site is described as law rather than proposal.',
        source: 'lgc',
      },
      {
        term: 'Appropriation',
        definition:
          'Permission to spend a stated amount for a stated purpose, granted by ordinance. Every peso on this site is an appropriation — permission, not a record of money that has left the treasury.',
        source: 'lgc',
      },
      {
        term: 'Appropriation ordinance',
        definition:
          'The local law that enacts the budget. The Sanggunian passes it and the {Mayor} signs it; the signature is the moment a plan becomes a budget.',
        source: 'bom',
      },
      {
        term: 'Supplemental budget',
        definition:
          'A budget enacted after the Annual Budget, to change it. It is how a {lgu} responds to something the original budget did not foresee.',
        source: 'bom',
      },
      {
        term: 'Local Expenditure Program',
        short: 'LEP',
        definition:
          "The {Mayor}'s proposed budget for next year, also called the Executive Budget, sent to the Sanggunian in October. It is arranged by office and type of expense rather than by program, and it is where the plan has been cut to fit the income the {lgu} expects.",
        source: 'bom',
      },
      {
        term: 'Budget Call',
        definition:
          "The {Mayor}'s instructions to every office at the start of budget preparation: how much it may ask for, and how to ask.",
        source: 'bom',
      },
      {
        term: 'Veto',
        definition:
          'The {Mayor}’s power to reject particular items in the budget the Sanggunian passed. A vetoed item can still pass if two-thirds of the Sanggunian vote to override.',
        source: 'lgc',
      },
    ],
  },
  {
    heading: 'How money moves',
    blurb: 'An appropriation becomes spending in steps, and each has its own word.',
    entries: [
      {
        term: 'Allotment',
        definition:
          'The authority given to an office to start committing money that the ordinance has appropriated. Between permission existing and an office being able to use it.',
        source: 'bom',
      },
      {
        term: 'Obligation',
        definition:
          'A commitment the {lgu} is now bound to pay — a signed contract, a purchase order, a payroll. The money is not gone, but it is no longer free.',
        source: 'bom',
      },
      {
        term: 'Disbursement',
        definition:
          'Cash actually leaving the treasury. This is the only one of the four that means money has been spent, and it is not what this site records.',
        source: 'bom',
      },
      {
        term: 'Continuing appropriation',
        definition:
          'An appropriation that stays available past the end of the budget year, for things like construction that cannot finish inside twelve months.',
        source: 'lgc',
      },
    ],
  },
  {
    heading: 'Buying what the budget pays for',
    blurb: 'How the {lgu} plans its purchases once it knows what it may spend.',
    entries: [
      {
        term: 'Project Procurement Management Plan',
        short: 'PPMP',
        definition:
          'What one office plans to buy for its programs, and when. A draft is made with the budget proposal; the final one after the budget is enacted. On this site these are the Projects pages.',
        source: 'procurement',
      },
      {
        term: 'Annual Procurement Plan',
        short: 'APP',
        definition:
          "Every purchase the {lgu} plans for the year, combined from all the offices' PPMPs by the Bids and Awards Committee.",
        source: 'procurement',
      },
      {
        term: 'Bids and Awards Committee',
        short: 'BAC',
        definition:
          'The committee that runs public bidding for what the {lgu} buys. Observers from CSOs may sit in.',
        source: 'procurement',
      },
    ],
  },
  {
    heading: 'What the money is for',
    blurb: 'Every peso is classified two ways: by what it buys, and by where it sits in the book.',
    entries: [
      {
        term: 'Personnel Services',
        short: 'PS',
        definition:
          'Pay and benefits for the people who do the work — salaries, allowances, retirement and leave benefits, and the cost of filling posts.',
        source: 'bom',
      },
      {
        term: 'Maintenance and Other Operating Expenses',
        short: 'MOOE',
        definition:
          'The cost of running services day to day: supplies, fuel and travel, electricity and water, repairs.',
        source: 'bom',
      },
      {
        term: 'Financial Expenses',
        short: 'FE',
        definition:
          'Bank charges, interest on loans and other financial charges. Shown as its own amount since the 2023 budget manual; earlier budgets counted it under MOOE.',
        source: 'bom',
      },
      {
        term: 'Capital Outlay',
        short: 'CO',
        definition:
          'Spending on things whose benefit outlasts the year and which the {lgu} then owns — buildings, equipment, roads, public markets.',
        source: 'lgc',
      },
      {
        term: 'General Administrative Services',
        short: 'GAS',
        definition:
          'The section of the budget covering the cost of an office existing at all: its staff, its premises, its running costs. Most offices file the bulk of their budget here, which is why it dominates the totals.',
        source: 'lgu',
      },
      {
        term: 'Support to Operations',
        short: 'STO',
        definition:
          'The section covering what makes front-line service possible from behind — records, transport, information systems.',
        source: 'lgu',
      },
      {
        term: 'Operations',
        definition:
          'The section covering the service an office exists to deliver: the clinic, the school feeding, the road repair.',
        source: 'lgu',
      },
    ],
  },
  {
    heading: 'How entries are organized',
    blurb: 'The shape of a budget entry, and the words for its parts.',
    entries: [
      {
        term: 'Program, project, activity',
        short: 'PPA',
        definition:
          'The three levels a budget entry can be. A program is a group of related work; a project is a specific undertaking with an end date; an activity is ongoing work that contributes to one. A program either states its own amount, or shows the sum of the projects and activities under it.',
        source: 'bom',
      },
      {
        term: 'Implementing office',
        definition:
          'The {lguAdj} office responsible for delivering an entry and accountable for its money. Not necessarily the office that benefits from it.',
        source: 'lgu',
      },
      {
        term: 'AIP reference code',
        definition:
          "The {lgu}'s own numbering for each entry — sector, level of government, type of office, the office, the section of the book, then the program and the entry within it. It labels rows; it does not add them up, and it carries no year.",
        source: 'lgu',
      },
      {
        term: GOAL,
        definition:
          'One of the outcomes {shortName} has committed to. Every entry is filed against one, which is how this site can show what the budget is aimed at rather than only who is spending it.',
        source: 'lgu',
      },
      {
        term: 'Cluster',
        definition:
          'A grouping of {lguAdj} offices that work towards the same {goal}.',
        source: 'lgu',
      },
      {
        term: 'Estimated cost',
        definition:
          'What an AIP entry is expected to cost if it is carried out. The AIP is a list of planned programs, more than the {lgu} can afford, so an estimated cost is not a budget and promises no funding.',
        source: 'lgu',
      },
      {
        term: 'Proposed budget',
        definition:
          'The budget the {Mayor} submits to the Sanggunian for next year: the Local Expenditure Program (LEP), drawn from the AIP but limited to what the {lgu} expects to afford. AIP figures on this site are estimated costs; enacted figures are appropriations.',
        source: 'lgu',
      },
    ],
  },
  {
    heading: 'The funds',
    blurb: 'A {lgu} does not have one purse. These are the ones that appear on this site.',
    entries: [
      {
        term: 'General Fund',
        short: 'GF',
        definition:
          "The {lgu}'s main account, holding its ordinary income. Most of the budget is here.",
        source: 'bom',
      },
      {
        term: 'Special Education Fund',
        short: 'SEF',
        definition:
          'A share of real property tax that may only be spent on public schools and education.',
        source: 'lgc',
      },
      {
        term: 'Local Development Fund',
        short: 'LDF',
        definition:
          'The 20% of national tax revenue a {lgu} must set aside for development projects rather than running costs.',
        source: 'bom',
      },
      {
        term: 'Local Disaster Risk Reduction and Management Fund',
        short: 'LDRRMF',
        definition:
          '5% of estimated revenue, reserved for preparing for and responding to disasters.',
        source: 'bom',
      },
      {
        term: 'Trust Fund',
        definition:
          'Money the {lgu} holds for a specific purpose on behalf of someone else, which it may not redirect.',
        source: 'bom',
      },
      {
        term: 'National Government Agency',
        short: 'NGA',
        definition:
          'Money coming from a national department for work carried out locally.',
        source: 'lgu',
      },
    ],
  },
  {
    heading: 'Who decides',
    blurb: 'The bodies named on this site, and what each one does.',
    entries: [
      {
        term: 'Sanggunian',
        definition:
          'The elected {lguAdj} council ({council}). It holds the budget hearings and passes the appropriation ordinance, which the {Mayor} then signs.',
        source: 'lgc',
      },
      {
        term: 'Local Finance Committee',
        short: 'LFC',
        definition:
          "The {lgu}'s budget, planning and treasury officers, who assess what the {lgu} can afford and recommend how to divide it.",
        source: 'bom',
      },
      {
        term: 'Local Development Council',
        definition:
          "The body that approves the {lgu}'s development plans and its Annual Investment Program, chaired by the {Mayor}, with barangay captains and CSO representatives. Here it is the {LguAdj} Development Council.",
        source: 'bom',
      },
      {
        term: "People's council",
        definition:
          'A federation of civil society organizations that takes part in planning and budgeting. Not every LGU has one. Where it exists, it reviews and endorses budget proposals; it does not hold a budget of its own.',
        source: 'lgu',
      },
      {
        term: 'Civil society organizations',
        short: 'CSOs',
        definition:
          "Non-government groups such as people's organizations, cooperatives, NGOs and sectoral associations. Accredited CSOs take part in planning and budgeting through the development council.",
        source: 'lgc',
      },
      {
        term: 'Department of Budget and Management',
        short: 'DBM',
        definition:
          "The national agency whose regional office reviews the {lgu}'s budget after it is signed, and can strike items that break national rules.",
        source: 'lgc',
      },
      {
        term: 'Commission on Audit',
        short: 'COA',
        definition:
          'The national agency that audits how public money was spent and publishes its findings every year.',
        source: 'bom',
      },
    ],
  },
];

/** The term's anchor on `/learn/glossary`, e.g. `#local-expenditure-program`. */
export function glossaryAnchor(term: string): string {
  return term
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const GLOSSARY_TERM_COUNT = GLOSSARY.reduce(
  (n, g) => n + g.entries.length,
  0,
);

export const SOURCE_LABEL: Record<GlossarySource, string> = {
  bom: 'DBM Budget Operations Manual for LGUs (2023)',
  lgc: 'Local Government Code of 1991',
  lgu: "the LGU's own budget documents and this portal",
  procurement: 'New Government Procurement Act (RA 12009)',
};
