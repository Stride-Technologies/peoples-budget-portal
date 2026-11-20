import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request } from 'express';
import request from 'supertest';
import { ProjectActivitiesController } from '../src/project-activities/project-activities.controller.js';
import { ProjectActivitiesService } from '../src/project-activities/project-activities.service.js';
import { AIPCodesService } from '../src/aip-codes/aip-codes.service.js';
import { BudgetRollupService } from '../src/budget-rollup/budget-rollup.service.js';
import { ProgramsService } from '../src/programs/programs.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PPACostMode,
  PPAType,
  ProgramStatus,
  Role,
} from '../src/generated/prisma/index.js';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    role: Role;
    email: string;
    firstName: string;
    lastName: string;
    identityType: string | null;
    officeId: string | null;
    civilSocietyOrganizationId: string | null;
  };
};

const user = {
  sub: 'user-1',
  role: Role.SUPER_ADMIN,
  email: 'admin@example.com',
  firstName: 'Test',
  lastName: 'User',
  identityType: null,
  officeId: null,
  civilSocietyOrganizationId: null,
};

describe('ProjectActivitiesController (e2e - stubbed)', () => {
  let app: INestApplication;

  const tx = {
    projectActivity: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  const prisma = {
    program: {
      findUnique: jest.fn(),
    },
    projectActivity: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (trx: typeof tx) => unknown) =>
      Promise.resolve(cb(tx)),
    ),
  } as unknown as PrismaService;

  const programs = {
    assertOwner: jest.fn(),
    assertCanRead: jest.fn(),
  } as unknown as ProgramsService;

  const codes = {
    resyncTentativePACodes: jest.fn(),
  } as unknown as AIPCodesService;

  const rollup = {
    recomputeProgram: jest.fn(),
  } as unknown as BudgetRollupService;

  beforeAll(async () => {
    @Module({
      controllers: [ProjectActivitiesController],
      providers: [
        ProjectActivitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProgramsService, useValue: programs },
        { provide: AIPCodesService, useValue: codes },
        { provide: BudgetRollupService, useValue: rollup },
      ],
    })
    class TestModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        consumer
          .apply((req: RequestWithUser, _res, next: NextFunction) => {
            req.user = user;
            next();
          })
          .forRoutes('*');
      }
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates a project/activity and forwards the payload through the HTTP route', async () => {
    const program = {
      id: 'program-1',
      deletedAt: null,
      status: ProgramStatus.DRAFT,
      implementationStartMonth: 1,
      implementationStartYear: 2026,
      implementationEndMonth: 12,
      implementationEndYear: 2026,
    };
    const created = {
      id: 'pa-1',
      tentativeAipReferenceCode: 'PA-0001',
      type: PPAType.PROJECT,
      costMode: PPACostMode.ACTIVITY_CHILDREN,
    };

    (prisma.program.findUnique as jest.Mock).mockResolvedValue(program);
    tx.projectActivity.create.mockResolvedValue(created);
    // The create writes a placeholder code; the resync derives the real one, so
    // the response body comes from the re-read rather than the create.
    tx.projectActivity.findUniqueOrThrow.mockResolvedValue(created);

    await request(app.getHttpServer())
      .post('/api/v1/programs/program-1/project-activities')
      .send({
        type: PPAType.PROJECT,
        name: 'Drainage project',
        expectedOutput: 'Drainage canals completed',
        costMode: PPACostMode.ACTIVITY_CHILDREN,
        implementationStartMonth: 3,
        implementationStartYear: 2026,
        implementationEndMonth: 10,
        implementationEndYear: 2026,
      })
      .expect(201);
  });

  it('rejects invalid project/activity periods through the HTTP layer', async () => {
    (prisma.program.findUnique as jest.Mock).mockResolvedValue({
      id: 'program-1',
      deletedAt: null,
      status: ProgramStatus.DRAFT,
      implementationStartMonth: 1,
      implementationStartYear: 2026,
      implementationEndMonth: 12,
      implementationEndYear: 2026,
    });

    await request(app.getHttpServer())
      .post('/api/v1/programs/program-1/project-activities')
      .send({
        type: PPAType.PROJECT,
        name: 'Drainage project',
        expectedOutput: 'Drainage canals completed',
        implementationStartMonth: 12,
        implementationStartYear: 2026,
        implementationEndMonth: 1,
        implementationEndYear: 2026,
      })
      .expect(400)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toContain(
          'Implementation period start must be earlier than or equal to end',
        );
      });
  });

  it('returns 403 when updating a project/activity outside DRAFT', async () => {
    (prisma.projectActivity.findUnique as jest.Mock).mockResolvedValue({
      id: 'pa-1',
      programId: 'program-1',
      costMode: PPACostMode.DIRECT_COSTS,
      implementationStartMonth: null,
      implementationStartYear: null,
      implementationEndMonth: null,
      implementationEndYear: null,
      program: {
        id: 'program-1',
        deletedAt: null,
        status: ProgramStatus.SUBMITTED,
      },
    });

    await request(app.getHttpServer())
      .patch('/api/v1/project-activities/pa-1')
      .send({
        name: 'Updated project name',
      })
      .expect(403)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toContain(
          'Project/Activities can only be mutated while the parent program is in DRAFT',
        );
      });
  });

  it('updates a project/activity through the HTTP route when the parent stays in DRAFT', async () => {
    (prisma.projectActivity.findUnique as jest.Mock).mockResolvedValue({
      id: 'pa-1',
      programId: 'program-1',
      costMode: PPACostMode.DIRECT_COSTS,
      implementationStartMonth: 2,
      implementationStartYear: 2026,
      implementationEndMonth: 11,
      implementationEndYear: 2026,
      program: {
        id: 'program-1',
        deletedAt: null,
        status: ProgramStatus.DRAFT,
        implementationStartMonth: 1,
        implementationStartYear: 2026,
        implementationEndMonth: 12,
        implementationEndYear: 2026,
      },
    });
    (prisma.projectActivity.update as jest.Mock).mockResolvedValue({
      id: 'pa-1',
      name: 'Updated project name',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/project-activities/pa-1')
      .send({
        name: 'Updated project name',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: 'pa-1',
          name: 'Updated project name',
        });
      });
  });

  it('finds a project/activity with nested relations through the HTTP route', async () => {
    (prisma.projectActivity.findUnique as jest.Mock).mockResolvedValue({
      id: 'pa-1',
      programId: 'program-1',
      program: {
        id: 'program-1',
        deletedAt: null,
        status: ProgramStatus.DRAFT,
      },
      lineItems: [{ id: 'li-1', amount: '1000.00' }],
      climateChangeTag: {
        id: 'tag-1',
        ccetCode: { code: 'CCET-1' },
      },
      children: [],
    });
    (programs.assertCanRead as jest.Mock).mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .get('/api/v1/project-activities/pa-1')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: 'pa-1',
          lineItems: [{ id: 'li-1', amount: '1000.00' }],
          climateChangeTag: { id: 'tag-1', ccetCode: { code: 'CCET-1' } },
        });
      });
  });

  it('deletes a project/activity tree and recomputes the parent program rollup', async () => {
    (prisma.projectActivity.findUnique as jest.Mock).mockResolvedValue({
      id: 'root-1',
      programId: 'program-1',
      program: {
        id: 'program-1',
        deletedAt: null,
        status: ProgramStatus.DRAFT,
      },
    });
    tx.projectActivity.findMany
      .mockResolvedValueOnce([{ id: 'child-1' }, { id: 'child-2' }])
      .mockResolvedValueOnce([{ id: 'grandchild-1' }])
      .mockResolvedValueOnce([]);
    tx.projectActivity.deleteMany.mockResolvedValue({
      count: 4,
    });
    (rollup.recomputeProgram as jest.Mock).mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/api/v1/project-activities/root-1')
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
