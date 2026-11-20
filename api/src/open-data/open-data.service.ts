import { Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';
import {
  PUBLIC_REGISTRY_KEY_PREFIX,
  PUBLIC_REGISTRY_TTL_SECONDS,
  REFERENCE_KEY_PREFIX,
  REFERENCE_TTL_SECONDS,
} from '../cache/cache.constants.js';
import {
  BudgetDocumentKind,
  BudgetDocumentStatus,
  Prisma,
} from '../generated/prisma/index';
import { PUBLICLY_VISIBLE } from '../public/public.service.js';
import { loadOrdinanceViews } from '../public/ordinance-registry.js';
import { loadCycleSections } from '../budget-cycles/cycle-sections.js';
import {
  ACTIVITY_COLUMNS,
  CLIMATE_COLUMNS,
  FUND_COLUMNS,
  FUND_SOURCE_NAMES,
  PROGRAM_COLUMNS,
  PROJECT_COLUMNS,
  mapProgram,
  mapProject,
  type MappedProgram,
  type ProjectRow,
} from './open-data.mapper.js';
import { toCsv } from './open-data.csv.js';
import {
  buildMetadata,
  documentOf,
  licenceLine,
  bundleName,
} from './open-data.metadata.js';

export const NO_OPEN_DATA = 'No open data for this year';
export const MAX_PAGE_SIZE = 500;

export type OpenDocument = 'AIP' | 'ANNUAL_BUDGET';
/** `?document=` values, and the suffix of a document's own bundle file. */
export const DOCUMENT_PARAM: Record<OpenDocument, string> = {
  AIP: 'aip',
  ANNUAL_BUDGET: 'annual',
};
const notFound = () =>
  new NotFoundException({ statusCode: 404, message: NO_OPEN_DATA });

interface OpenCycle {
  id: string;
  fiscalYear: number;
  status: string;
  updatedAt: Date;
}

/**
 * One document of an open year. `ordinance` is set when the Annual Budget is
 * read from an enacted Ordinance's PPAs; otherwise the document is read from
 * the year's published programs (the AIP, or FY2026's Annual Budget until its
 * Ordinance is enacted — the interim rule in `computeSections`).
 */
interface Source {
  cycle: OpenCycle;
  document: OpenDocument;
  ordinance: { id: string; finalizedAt: Date | null } | null;
}

/** Everything one document of an open year publishes, mapped once and cached. */
interface Dataset {
  cycle: { fiscalYear: number; status: string };
  document: OpenDocument;
  dataAsOf: string;
  programs: MappedProgram[];
  projects: ProjectRow[];
}

export interface ProgramFilters {
  office?: string;
  sector?: string;
  finishLine?: number;
  code?: string;
  page?: number;
  limit?: number;
}

/**
 * Open data (specs/007). Reads exactly what the public site shows — the
 * published snapshot of every `PUBLICLY_VISIBLE` program — through the
 * allow-list mapper, and only for a cycle a super admin has opened.
 *
 * Caching rides the public registry's prefix, so every write that already
 * refreshes the public list (publish, discard, delete, public feedback, the
 * open-data switch) drops these entries too; the 300 s TTL covers the rest
 * (PPMP publish).
 */
@Injectable()
export class OpenDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * The gate every year-scoped route goes through. A closed year and a year
   * that does not exist answer the same 404, so a closed year cannot be told
   * apart from a missing one.
   */
  async findOpenCycle(year: number): Promise<OpenCycle> {
    const cycle = Number.isInteger(year)
      ? await this.prisma.aIPCycle.findUnique({
          where: { fiscalYear: year },
          select: {
            id: true,
            fiscalYear: true,
            status: true,
            updatedAt: true,
            openDataEnabled: true,
          },
        })
      : null;
    if (!cycle?.openDataEnabled) throw notFound();
    const { openDataEnabled: _open, ...rest } = cycle;
    return rest;
  }

  /**
   * The documents each cycle publishes, default first: the AIP while the year
   * is in the AIP section, then the Annual Budget while it is in the Annual
   * Budget section (specs/012 D14, the public site's own rule). A year in
   * neither keeps its old single document, so its URL never changes meaning.
   */
  private async documentsOf(cycles: OpenCycle[]) {
    const [sections, enacted] = await Promise.all([
      loadCycleSections(this.prisma),
      this.prisma.budgetDocument.findMany({
        where: {
          kind: BudgetDocumentKind.ORDINANCE,
          status: BudgetDocumentStatus.ENACTED,
          budgetCycle: { aipCycle: { id: { in: cycles.map((c) => c.id) } } },
        },
        select: {
          id: true,
          finalizedAt: true,
          budgetCycle: { select: { aipCycle: { select: { id: true } } } },
        },
      }),
    ]);
    const ordinanceOf = new Map(
      enacted.map((d) => [
        d.budgetCycle.aipCycle?.id,
        { id: d.id, finalizedAt: d.finalizedAt },
      ]),
    );
    return new Map(
      cycles.map((c) => {
        const of = sections.get(c.id) ?? [];
        const documents: OpenDocument[] = [];
        if (of.includes('aip')) documents.push('AIP');
        if (of.includes('annual')) documents.push('ANNUAL_BUDGET');
        if (!documents.length) documents.push(documentOf(c));
        return [c.id, { documents, ordinance: ordinanceOf.get(c.id) ?? null }];
      }),
    );
  }

  /**
   * The gate plus the document: `document` is a `?document=` value, or the
   * year's default when absent. A document the year does not have answers the
   * same 404 as a closed year.
   */
  async findSource(year: number, document?: string): Promise<Source> {
    const cycle = await this.findOpenCycle(year);
    const { documents, ordinance } = (await this.documentsOf([cycle])).get(
      cycle.id,
    )!;
    const wanted =
      document === undefined
        ? documents[0]
        : documents.find((d) => DOCUMENT_PARAM[d] === document);
    if (!wanted) throw notFound();
    return {
      cycle,
      document: wanted,
      ordinance: wanted === 'ANNUAL_BUDGET' ? ordinance : null,
    };
  }

  /** Published programs of a cycle, in the public registry's order. */
  loadPublishedPrograms(cycleId: string) {
    return this.prisma.program.findMany({
      where: { ...PUBLICLY_VISIBLE, aipCycleId: cycleId },
      select: {
        publishedName: true,
        name: true,
        publishedProposedTotal: true,
        psProposedTotal: true,
        mooeProposedTotal: true,
        coProposedTotal: true,
        psTotal: true,
        mooeTotal: true,
        coTotal: true,
        publishedVersion: {
          select: { snapshot: true, version: true, submittedAt: true },
        },
        office: {
          select: {
            acronym: true,
            name: true,
            cluster: { select: { name: true } },
          },
        },
        finishLine: { select: { name: true, visionNumber: true } },
        papSector: { select: { code: true, name: true } },
      },
      orderBy: [
        { office: { acronym: 'asc' } },
        { papClass: { sort: 'asc', nulls: 'last' } },
        { orderIndex: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  loadPublishedProjects(cycleId: string) {
    return this.prisma.pPMP.findMany({
      where: { aipCycleId: cycleId, isPublished: true },
      select: {
        id: true,
        name: true,
        classification: true,
        fundingProgram: true,
        publishedAt: true,
        office: { select: { acronym: true, name: true } },
        lineItems: { select: { lineTotal: true } },
      },
      orderBy: [{ office: { acronym: 'asc' } }, { name: 'asc' }],
    });
  }

  /**
   * The cache key carries the Ordinance id, so enacting one switches the
   * year's Annual Budget at once instead of after the TTL.
   */
  private async dataset({
    cycle,
    document,
    ordinance,
  }: Source): Promise<Dataset> {
    return this.cache.getOrSet(
      `${PUBLIC_REGISTRY_KEY_PREFIX}open-data:dataset:${cycle.fiscalYear}:${document}:${ordinance?.id ?? 'programs'}`,
      PUBLIC_REGISTRY_TTL_SECONDS,
      async () => {
        const [{ programs, newest }, projects] = await Promise.all([
          ordinance
            ? this.ordinancePrograms(cycle, ordinance)
            : this.publishedPrograms(cycle),
          this.loadPublishedProjects(cycle.id),
        ]);
        return {
          cycle: { fiscalYear: cycle.fiscalYear, status: cycle.status },
          document,
          dataAsOf: (newest ?? cycle.updatedAt).toISOString(),
          programs,
          projects: projects.map(mapProject),
        };
      },
    );
  }

  private async publishedPrograms(cycle: OpenCycle) {
    const rows = await this.loadPublishedPrograms(cycle.id);
    let newest: Date | null = null;
    const programs = rows.map(({ publishedVersion, ...live }) => {
      // A program is republished in place: Program.publishedAt is the
      // first publish only, the version's own time is this one's.
      const publishedAt = publishedVersion?.submittedAt ?? null;
      if (publishedAt && (!newest || publishedAt > newest))
        newest = publishedAt;
      return mapProgram(
        (publishedVersion?.snapshot ?? {}) as Record<string, unknown>,
        {
          ...live,
          publishedAt,
          version: publishedVersion?.version ?? null,
        },
        cycle,
      );
    });
    return { programs, newest: newest as Date | null };
  }

  /** An Ordinance has no versions: every PPA is as of its enactment. */
  private async ordinancePrograms(
    cycle: OpenCycle,
    ordinance: NonNullable<Source['ordinance']>,
  ) {
    const views = await loadOrdinanceViews(
      this.prisma,
      ordinance.id,
      cycle.fiscalYear,
    );
    return {
      programs: views.map(({ snapshot, live }) =>
        mapProgram(
          snapshot,
          { ...live, publishedAt: ordinance.finalizedAt },
          cycle,
        ),
      ),
      newest: ordinance.finalizedAt,
    };
  }

  // ─── Cycles ───────────────────────────────────────────────────────────

  /** Every cycle the public site lists, open or not, newest first. */
  async listCycles() {
    const cycles = await this.prisma.aIPCycle.findMany({
      select: {
        id: true,
        fiscalYear: true,
        status: true,
        updatedAt: true,
        openDataEnabled: true,
      },
      orderBy: { fiscalYear: 'desc' },
    });
    const docs = await this.documentsOf(cycles);
    return Promise.all(
      cycles.map(async ({ openDataEnabled: open, ...c }) => {
        const { documents, ordinance } = docs.get(c.id)!;
        const fy = c.fiscalYear;
        const source = (document: OpenDocument): Source => ({
          cycle: c,
          document,
          ordinance: document === 'ANNUAL_BUDGET' ? ordinance : null,
        });
        const perDocument = open
          ? await Promise.all(
              documents.map(async (d) => ({
                document: d,
                dataAsOf: (await this.dataset(source(d))).dataAsOf,
                bundleUrl: `/open-data/${fy}/${bundleName(fy)}-${DOCUMENT_PARAM[d]}.zip`,
              })),
            )
          : [];
        return {
          fiscalYear: fy,
          // The default document, for clients written before there were two.
          document: documents[0],
          open,
          dataAsOf: perDocument[0]?.dataAsOf ?? null,
          bundleUrl: open ? `/open-data/${fy}/${bundleName(fy)}.zip` : null,
          documents: perDocument,
        };
      }),
    );
  }

  async getCycle(year: number, document?: string) {
    const data = await this.dataset(await this.findSource(year, document));
    const zero = new Prisma.Decimal(0);
    const totals = { proposed: zero, ps: zero, mooe: zero, fe: zero, co: zero };
    for (const { program: p } of data.programs) {
      totals.proposed = totals.proposed.plus(p.proposedTotal);
      totals.ps = totals.ps.plus(p.ps);
      totals.mooe = totals.mooe.plus(p.mooe);
      totals.fe = totals.fe.plus(p.fe);
      totals.co = totals.co.plus(p.co);
    }
    return {
      fiscalYear: data.cycle.fiscalYear,
      document: data.document,
      dataAsOf: data.dataAsOf,
      licence: licenceLine(),
      counts: {
        programs: data.programs.length,
        activities: data.programs.reduce((n, m) => n + m.activities.length, 0),
        projects: data.projects.length,
      },
      totals: {
        proposed: totals.proposed.toFixed(2),
        ps: totals.ps.toFixed(2),
        mooe: totals.mooe.toFixed(2),
        fe: totals.fe.toFixed(2),
        co: totals.co.toFixed(2),
      },
    };
  }

  // ─── Programs ─────────────────────────────────────────────────────────

  async listPrograms(year: number, f: ProgramFilters, document?: string) {
    const data = await this.dataset(await this.findSource(year, document));
    const page = Math.max(1, Math.floor(f.page ?? 1) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(f.limit ?? 100) || 100),
    );
    const office = f.office?.toLowerCase();
    const matches = data.programs
      .map((m) => m.program)
      .filter(
        (p) =>
          (!office || p.officeCode?.toLowerCase() === office) &&
          (!f.sector || p.papSectorCode === f.sector) &&
          (f.finishLine === undefined || p.finishLineNumber === f.finishLine) &&
          (!f.code || p.aipCode === f.code),
      );
    return {
      data: matches.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: matches.length,
    };
  }

  async getProgram(year: number, id: string, document?: string) {
    const data = await this.dataset(await this.findSource(year, document));
    const found = data.programs.find((m) => m.program.id === id);
    if (!found) throw new NotFoundException('Program not found');
    return found.nested;
  }

  /**
   * The program row behind a version route: public, in this open year. An
   * Ordinance's PPAs have no versions, so they 404 here.
   */
  private async publicProgram(year: number, id: string, document?: string) {
    const { cycle, ordinance } = await this.findSource(year, document);
    if (ordinance) throw new NotFoundException('Program not found');
    const program = await this.prisma.program.findFirst({
      where: { id, aipCycleId: cycle.id, ...PUBLICLY_VISIBLE },
      select: {
        publishedName: true,
        name: true,
        publishedProposedTotal: true,
        psProposedTotal: true,
        mooeProposedTotal: true,
        coProposedTotal: true,
        psTotal: true,
        mooeTotal: true,
        coTotal: true,
        publishedVersion: { select: { version: true } },
        office: {
          select: {
            acronym: true,
            name: true,
            cluster: { select: { name: true } },
          },
        },
        finishLine: { select: { name: true, visionNumber: true } },
        papSector: { select: { code: true, name: true } },
      },
    });
    if (!program) throw new NotFoundException('Program not found');
    return { cycle, program };
  }

  /**
   * Published versions, newest first. The accountable office, never a person
   * (the public site's rule, D21). Only up to the version the public is served.
   */
  async listVersions(year: number, id: string, document?: string) {
    const { program } = await this.publicProgram(year, id, document);
    const versions = await this.prisma.programVersion.findMany({
      where: {
        programId: id,
        version: { lte: program.publishedVersion!.version },
      },
      select: { version: true, submittedAt: true },
      orderBy: { version: 'desc' },
    });
    const office = program.office
      ? { code: program.office.acronym, name: program.office.name }
      : null;
    return versions.map((v) => ({
      version: v.version,
      publishedAt: v.submittedAt.toISOString(),
      office,
    }));
  }

  async getVersion(
    year: number,
    id: string,
    version: number,
    document?: string,
  ) {
    const { cycle, program } = await this.publicProgram(year, id, document);
    const row =
      Number.isInteger(version) && version <= program.publishedVersion!.version
        ? await this.prisma.programVersion.findFirst({
            where: { programId: id, version },
            select: { snapshot: true, version: true, submittedAt: true },
          })
        : null;
    if (!row) throw new NotFoundException('Version not found');
    const { publishedVersion: _pv, ...live } = program;
    return mapProgram(
      (row.snapshot ?? {}) as Record<string, unknown>,
      { ...live, publishedAt: row.submittedAt, version: row.version },
      cycle,
    ).nested;
  }

  async listProjects(year: number, document?: string) {
    return (await this.dataset(await this.findSource(year, document))).projects;
  }

  // ─── Bundle ───────────────────────────────────────────────────────────

  /**
   * The yearly zip: five CSVs, the nested JSON and METADATA.md. Built on the
   * first request after a change and cached whole, so a reader gets the old
   * zip or the new one, never half.
   */
  async getBundle(
    year: number,
    document?: string,
  ): Promise<{ dataAsOf: string; zip: Buffer }> {
    const source = await this.findSource(year, document);
    const cached = await this.cache.getOrSet(
      `${PUBLIC_REGISTRY_KEY_PREFIX}open-data:${year}:${source.document}:${source.ordinance?.id ?? 'programs'}`,
      PUBLIC_REGISTRY_TTL_SECONDS,
      async () => {
        const { dataAsOf, zip } = await this.buildBundle(source);
        return { dataAsOf, zipBase64: zip.toString('base64') };
      },
    );
    return {
      dataAsOf: cached.dataAsOf,
      zip: Buffer.from(cached.zipBase64, 'base64'),
    };
  }

  async buildBundle(
    source: Source,
  ): Promise<{ dataAsOf: string; zip: Buffer }> {
    const data = await this.dataset(source);
    const year = source.cycle.fiscalYear;
    const activities = data.programs.flatMap((m) => m.activities);

    const zip = new JSZip();
    zip.file(
      'programs.csv',
      toCsv(
        PROGRAM_COLUMNS,
        data.programs.map((m) => m.program),
      ),
    );
    zip.file('project-activities.csv', toCsv(ACTIVITY_COLUMNS, activities));
    zip.file(
      'funds.csv',
      toCsv(
        FUND_COLUMNS,
        data.programs.flatMap((m) => m.funds),
      ),
    );
    zip.file(
      'climate-tags.csv',
      toCsv(
        CLIMATE_COLUMNS,
        data.programs.flatMap((m) => m.climateRows),
      ),
    );
    zip.file('projects.csv', toCsv(PROJECT_COLUMNS, data.projects));
    zip.file(
      `${bundleName(year)}.json`,
      JSON.stringify(
        {
          cycle: { fiscalYear: year, document: data.document },
          dataAsOf: data.dataAsOf,
          licence: licenceLine(),
          programs: data.programs.map((m) => m.nested),
          projects: data.projects,
        },
        null,
        2,
      ),
    );
    zip.file(
      'METADATA.md',
      buildMetadata(data.cycle, data.document, new Date(data.dataAsOf), {
        programs: data.programs.length,
        activities: activities.length,
        projects: data.projects.length,
      }),
    );
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    return { dataAsOf: data.dataAsOf, zip: buffer };
  }

  // ─── Reference lists ──────────────────────────────────────────────────
  // Not gated by a cycle switch: these names are printed on every public page.

  private ref<T>(name: string, load: () => Promise<T>) {
    return this.cache.getOrSet(
      `${REFERENCE_KEY_PREFIX}open-data:${name}`,
      REFERENCE_TTL_SECONDS,
      load,
    );
  }

  referenceOffices() {
    return this.ref('offices', async () =>
      (
        await this.prisma.office.findMany({
          where: { isActive: true },
          select: {
            acronym: true,
            name: true,
            cluster: { select: { name: true } },
          },
          orderBy: { acronym: 'asc' },
        })
      ).map((o) => ({
        code: o.acronym,
        name: o.name,
        cluster: o.cluster.name,
      })),
    );
  }

  referenceFinishLines() {
    return this.ref('finish-lines', async () =>
      (
        await this.prisma.finishLine.findMany({
          where: { visionNumber: { not: null } },
          select: { visionNumber: true, name: true },
          orderBy: { visionNumber: 'asc' },
        })
      ).map((f) => ({ number: f.visionNumber, name: f.name })),
    );
  }

  referencePapSectors() {
    return this.ref('pap-sectors', () =>
      this.prisma.pAPSector.findMany({
        where: { isActive: true },
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    );
  }

  referenceCcetCodes() {
    return this.ref('ccet-codes', () =>
      this.prisma.climateTypologyCode.findMany({
        where: { isActive: true },
        select: { code: true, pillar: true, name: true, description: true },
        orderBy: { code: 'asc' },
      }),
    );
  }

  referenceFundSources() {
    return Object.entries(FUND_SOURCE_NAMES).map(([code, name]) => ({
      code,
      name,
    }));
  }
}
