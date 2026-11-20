import { Prisma, ProgramAuditAction, Role } from '../generated/prisma/index';
import { plainToInstance } from 'class-transformer';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { UpdateProgramDto } from '../programs/dto/update-program.dto.js';
import { UpdateProjectActivityDto } from '../project-activities/dto/update-project-activity.dto.js';
import {
  ESTIMATE_AUDIT_FIELDS,
  PROGRAM_AUDIT_FIELDS,
  PROJECT_ACTIVITY_AUDIT_FIELDS,
  diffFields,
  summarizeFieldChanges,
} from './audit-fields.js';
import { ProgramAuditLogService } from './program-audit-log.service.js';
import { ProgramDiffService } from './program-diff.service.js';
import { ProgramAuditQueryService } from './program-audit-query.service.js';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const actor: JwtPayload = {
  sub: 'u1',
  role: Role.STAFF,
  email: 'person1@example.gov.ph',
  firstName: 'M',
  lastName: 'R',
  identityType: null,
  officeId: 'office-cpdo',
  civilSocietyOrganizationId: null,
  permissions: ['aip:write'],
  allOfficesScope: false,
};

describe('diffFields', () => {
  it('reports only fields that actually moved', () => {
    const diff = diffFields(
      { name: 'Old', description: 'same', remarks: null },
      { name: 'New', description: 'same' },
      PROGRAM_AUDIT_FIELDS,
    );
    expect(diff).toEqual({ name: { from: 'Old', to: 'New' } });
  });

  it('returns null when nothing changed — the no-op PATCH case (D22)', () => {
    expect(
      diffFields({ name: 'Same' }, { name: 'Same' }, PROGRAM_AUDIT_FIELDS),
    ).toBeNull();
  });

  it('ignores fields absent from the DTO rather than reading them as cleared', () => {
    expect(
      diffFields(
        { name: 'A', description: 'B' },
        { name: 'A' },
        PROGRAM_AUDIT_FIELDS,
      ),
    ).toBeNull();
  });

  // #82: ValidationPipe hands the service a DTO *instance*, whose every declared
  // field is an own key set to undefined — a literal object never shows the bug.
  it('ignores unsent fields on a real DTO instance (program)', () => {
    const dto = plainToInstance(UpdateProgramDto, { name: 'Renamed' });
    expect(
      diffFields(
        { name: 'Old', description: 'B', remarks: 'R', hostOfficeId: 'o1' },
        dto as unknown as Record<string, unknown>,
        PROGRAM_AUDIT_FIELDS,
      ),
    ).toEqual({ name: { from: 'Old', to: 'Renamed' } });
  });

  it('ignores unsent fields on a real DTO instance (project/activity)', () => {
    const dto = plainToInstance(UpdateProjectActivityDto, { name: 'Renamed' });
    expect(
      diffFields(
        { name: 'Old', type: 'PROJECT', costMode: 'LINE_ITEMS' },
        dto as unknown as Record<string, unknown>,
        PROJECT_ACTIVITY_AUDIT_FIELDS,
      ),
    ).toEqual({ name: { from: 'Old', to: 'Renamed' } });
  });

  it('reads a blank text field against a never-set one as no change', () => {
    expect(
      diffFields(
        { description: null },
        { description: '' },
        PROGRAM_AUDIT_FIELDS,
      ),
    ).toBeNull();
  });

  it('treats an explicit null as a real clearing edit', () => {
    expect(
      diffFields(
        { description: 'B' },
        { description: null },
        PROGRAM_AUDIT_FIELDS,
      ),
    ).toEqual({ description: { from: 'B', to: null } });
  });

  it('compares a Decimal against its wire string by value, not identity', () => {
    // The DB hands back Prisma.Decimal; the DTO carries a string. Same money
    // must not read as a change, or every save would log a phantom edit.
    expect(
      diffFields(
        { mooeEstimate: new Prisma.Decimal('180000.00') },
        { mooeEstimate: '180000.00' },
        ESTIMATE_AUDIT_FIELDS,
      ),
    ).toBeNull();

    expect(
      diffFields(
        { mooeEstimate: new Prisma.Decimal('180000.00') },
        { mooeEstimate: '450000.00' },
        ESTIMATE_AUDIT_FIELDS,
      ),
    ).toEqual({
      // Both sides land in canonical Decimal form, so the history shows a clean
      // 180000 → 450000 rather than a formatting artefact.
      mooeEstimate: { from: '180000', to: '450000' },
    });
  });

  it('never reports a field outside the allow-list', () => {
    // Rollups move as a consequence of an edit; logging them double-reports it.
    expect(
      diffFields(
        { grandTotal: '0', psTotal: '0' },
        { grandTotal: '999', psTotal: '999' },
        PROJECT_ACTIVITY_AUDIT_FIELDS,
      ),
    ).toBeNull();
  });
});

describe('summarizeFieldChanges', () => {
  it('names the single changed field', () => {
    expect(summarizeFieldChanges({ name: { from: 'a', to: 'b' } })).toBe(
      'Changed name',
    );
  });

  it('counts and lists multiple', () => {
    expect(
      summarizeFieldChanges({
        name: { from: 'a', to: 'b' },
        remarks: { from: null, to: 'x' },
      }),
    ).toBe('Changed 2 fields: name, remarks');
  });
});

describe('ProgramAuditLogService', () => {
  const makeTx = () => ({
    programAuditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  });

  it('writes nothing for a diff-bearing action with an empty diff (D22)', async () => {
    const tx = makeTx();
    const service = new ProgramAuditLogService();

    const result = await service.record(
      {
        programId: 'p1',
        action: ProgramAuditAction.PROGRAM_UPDATED,
        actor,
        onBehalfOfOfficeId: 'office-cago',
        summary: 'No changes',
        changes: null,
      },
      tx as never,
    );

    expect(result).toBeNull();
    expect(tx.programAuditLog.create).not.toHaveBeenCalled();
  });

  it('still records an event action that carries no diff', async () => {
    const tx = makeTx();
    const service = new ProgramAuditLogService();

    await service.record(
      {
        programId: 'p1',
        action: ProgramAuditAction.PUBLISHED,
        actor,
        onBehalfOfOfficeId: 'office-cago',
        summary: 'Published as v1',
      },
      tx as never,
    );

    expect(tx.programAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('records the office acted FOR, not the actor’s home office', async () => {
    const tx = makeTx();
    const service = new ProgramAuditLogService();

    await service.record(
      {
        programId: 'p1',
        action: ProgramAuditAction.PA_ADDED,
        actor, // home office is CPDO
        onBehalfOfOfficeId: 'office-cago',
        summary: 'Added a PPA',
      },
      tx as never,
    );

    const arg = tx.programAuditLog.create.mock.calls[0][0] as {
      data: { onBehalfOfOfficeId: string; actorUserId: string };
    };
    expect(arg.data.onBehalfOfOfficeId).toBe('office-cago');
    expect(arg.data.actorUserId).toBe('u1');
  });

  it('exposes no update or delete path, for anyone', () => {
    const service = new ProgramAuditLogService() as unknown as Record<
      string,
      unknown
    >;
    expect(service.update).toBeUndefined();
    expect(service.remove).toBeUndefined();
    expect(service.delete).toBeUndefined();
  });
});

describe('ProgramDiffService', () => {
  const makePrisma = (
    published: Record<string, unknown> | null,
    live: Record<string, unknown>,
  ) =>
    ({
      program: {
        findFirst: jest.fn().mockResolvedValue({
          ...live,
          publishedVersion: published ? { snapshot: published } : null,
        }),
      },
    }) as unknown as PrismaService;

  const base = {
    name: 'Urban Agriculture Expansion Program',
    proposedTotal: new Prisma.Decimal('880000.00'),
    projectActivities: [],
  };

  it('marks every PPA as added when the program has never been published', async () => {
    const service = new ProgramDiffService(
      makePrisma(null, {
        ...base,
        projectActivities: [{ id: 'pa1', name: 'Communal Garden' }],
      }),
    );

    const diff = await service.diffAgainstPublished('p1');
    expect(diff.publishedTotal).toBeNull();
    expect(diff.paChanges).toEqual([
      { paId: 'pa1', name: 'Communal Garden', status: 'added', fields: null },
    ]);
  });

  it('reports added, removed, and changed PPAs in one pass', async () => {
    const service = new ProgramDiffService(
      makePrisma(
        {
          name: base.name,
          proposedTotal: '610000.00',
          projectActivities: [
            { id: 'pa1', name: 'Starter Kits', mooeEstimate: '180000.00' },
            { id: 'pa2', name: 'Hydroponics Training' },
          ],
        },
        {
          ...base,
          projectActivities: [
            {
              id: 'pa1',
              name: 'Starter Kits',
              mooeEstimate: new Prisma.Decimal('450000.00'),
            },
            { id: 'pa3', name: 'Communal Garden' },
          ],
        },
      ),
    );

    const diff = await service.diffAgainstPublished('p1');
    const byStatus = Object.fromEntries(
      diff.paChanges.map((c) => [c.status, c]),
    );

    expect(byStatus.changed.fields).toEqual({
      mooeEstimate: { from: '180000', to: '450000' },
    });
    expect(byStatus.added.paId).toBe('pa3');
    expect(byStatus.removed.paId).toBe('pa2');
    expect(diff.publishedTotal).toBe('610000.00');
    expect(diff.draftTotal).toBe('880000.00');
    expect(diff.hasChanges).toBe(true);
  });

  it('reports no changes when the working copy matches the snapshot', async () => {
    const service = new ProgramDiffService(
      makePrisma(
        {
          name: base.name,
          proposedTotal: '880000.00',
          projectActivities: [{ id: 'pa1', name: 'Starter Kits' }],
        },
        { ...base, projectActivities: [{ id: 'pa1', name: 'Starter Kits' }] },
      ),
    );

    const diff = await service.diffAgainstPublished('p1');
    expect(diff.hasChanges).toBe(false);
    expect(diff.paChanges).toEqual([]);
  });
});

describe('ProgramAuditQueryService.forAll', () => {
  const setup = (scope: { officeId?: { in: string[] } }) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ProgramAuditQueryService(
      { programAuditLog: { findMany } } as unknown as PrismaService,
      {
        officeScopeWhere: jest.fn().mockResolvedValue(scope),
      } as unknown as OfficeScopeService,
    );
    const whereOf = () =>
      (findMany.mock.calls[0][0] as { where: Prisma.ProgramAuditLogWhereInput })
        .where;
    return { service, whereOf };
  };

  it('streams every office for an all-offices caller', async () => {
    const { service, whereOf } = setup({});
    await service.forAll({}, actor);
    expect(whereOf()).toEqual({});
  });

  it('bounds the stream by office scope', async () => {
    const { service, whereOf } = setup({ officeId: { in: ['a', 'b'] } });
    await service.forAll({}, actor);
    expect(whereOf()).toEqual({ program: { officeId: { in: ['a', 'b'] } } });
  });

  it('narrows to an office in scope, and matches nothing for one outside it', async () => {
    const inScope = setup({ officeId: { in: ['a', 'b'] } });
    await inScope.service.forAll({ officeId: 'a' }, actor);
    expect(inScope.whereOf()).toEqual({ program: { officeId: 'a' } });

    const outside = setup({ officeId: { in: ['a', 'b'] } });
    await outside.service.forAll({ officeId: 'z' }, actor);
    expect(outside.whereOf()).toEqual({ program: { officeId: { in: [] } } });
  });
});
