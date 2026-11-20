import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { NextFunction, Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { AIPCyclesController } from '../src/aip-cycles/aip-cycles.controller.js';
import { AIPCyclesService } from '../src/aip-cycles/aip-cycles.service.js';
import { ProgramWorkflowService } from '../src/programs/program-workflow.service.js';
import type { JwtPayload } from '../src/auth/decorators/current-user.decorator.js';
import { ProgramStatus, Role } from '../src/generated/prisma/index';

const headUser: JwtPayload = {
  sub: 'head-1',
  role: Role.HEAD,
  email: 'head@example.com',
  firstName: 'Head',
  lastName: 'User',
  identityType: null,
  officeId: 'office-A',
  civilSocietyOrganizationId: null,
};

type RequestWithUser = Request & { user?: JwtPayload };

type EndorsementErrorBody = {
  message: string;
  blockers?: Array<{ id: string; name: string; status: string }>;
};

function buildApp(workflowValue: object, serviceValue?: object) {
  let capturedApp: INestApplication;

  @Module({
    controllers: [AIPCyclesController],
    providers: [
      {
        provide: AIPCyclesService,
        useValue: serviceValue ?? { findAll: jest.fn() },
      },
      {
        provide: ProgramWorkflowService,
        useValue: workflowValue,
      },
    ],
  })
  class TestModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer
        .apply((req: RequestWithUser, _res: unknown, next: NextFunction) => {
          req.user = headUser;
          next();
        })
        .forRoutes('*');
    }
  }

  return Test.createTestingModule({ imports: [TestModule] })
    .compile()
    .then((moduleRef: TestingModule) => {
      capturedApp = moduleRef.createNestApplication();
      return capturedApp.init().then(() => capturedApp);
    });
}

describe('AIPCyclesController — POST /aip-cycles/:id/submit-for-endorsement', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 with { submitted: n } when all programs are HEAD_REVIEWED', async () => {
    app = await buildApp({
      batchSubmitForEndorsement: jest.fn().mockResolvedValue({ submitted: 3 }),
    });

    const server = app.getHttpServer() as Server;
    await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(200)
      .expect({ submitted: 3 });
  });

  it('returns 422 when no programs are ready for endorsement', async () => {
    app = await buildApp({
      batchSubmitForEndorsement: jest
        .fn()
        .mockRejectedValue(
          new UnprocessableEntityException('No programs ready for endorsement'),
        ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(422);

    expect((res.body as EndorsementErrorBody).message).toMatch(
      /No programs ready/i,
    );
  });

  it('returns 422 with blocker list when a SUBMITTED program blocks submission', async () => {
    app = await buildApp({
      batchSubmitForEndorsement: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          message: 'Some programs are not yet ready for endorsement',
          blockers: [
            {
              id: 'p-2',
              name: 'Blocker Program',
              status: ProgramStatus.SUBMITTED,
            },
          ],
        }),
      ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(422);

    const body = res.body as EndorsementErrorBody;
    expect(body.message).toMatch(/not yet ready/i);
    expect(body.blockers).toHaveLength(1);
    expect(body.blockers?.[0]).toMatchObject({
      id: 'p-2',
      status: ProgramStatus.SUBMITTED,
    });
  });

  it('returns 422 with blocker list when a FOR_REVISION program blocks submission', async () => {
    app = await buildApp({
      batchSubmitForEndorsement: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          message: 'Some programs are not yet ready for endorsement',
          blockers: [
            {
              id: 'p-3',
              name: 'Revision Program',
              status: ProgramStatus.FOR_REVISION,
            },
          ],
        }),
      ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(422);

    expect((res.body as EndorsementErrorBody).blockers?.[0].status).toBe(
      ProgramStatus.FOR_REVISION,
    );
  });

  it('returns 422 with blocker list when a DRAFT program blocks submission', async () => {
    app = await buildApp({
      batchSubmitForEndorsement: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          message: 'Some programs are not yet ready for endorsement',
          blockers: [
            {
              id: 'p-4',
              name: 'Draft Program',
              status: ProgramStatus.DRAFT,
            },
          ],
        }),
      ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(422);

    expect((res.body as EndorsementErrorBody).blockers?.[0].status).toBe(
      ProgramStatus.DRAFT,
    );
  });

  it('re-submission after all programs are PENDING_ENDORSEMENT returns 422', async () => {
    // After a successful batch submit, all programs flip to PENDING_ENDORSEMENT.
    // A second call finds nothing in HEAD_REVIEWED → 422 "No programs ready".
    app = await buildApp({
      batchSubmitForEndorsement: jest
        .fn()
        .mockResolvedValueOnce({ submitted: 3 })
        .mockRejectedValueOnce(
          new UnprocessableEntityException('No programs ready for endorsement'),
        ),
    });

    const server = app.getHttpServer() as Server;

    // First call succeeds.
    await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(200)
      .expect({ submitted: 3 });

    // Second call on the same cycle → 422.
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-endorsement')
      .expect(422);

    expect((res.body as EndorsementErrorBody).message).toMatch(
      /No programs ready/i,
    );
  });
});

describe('AIPCyclesController — POST /aip-cycles/:id/submit-for-approval', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 with { submitted: n } when all programs are ENDORSED', async () => {
    app = await buildApp({
      batchSubmitForApproval: jest.fn().mockResolvedValue({ submitted: 3 }),
    });

    const server = app.getHttpServer() as Server;
    await request(server)
      .post('/aip-cycles/cycle-1/submit-for-approval')
      .expect(200)
      .expect({ submitted: 3 });
  });

  it('returns 422 when no programs are ready for approval', async () => {
    app = await buildApp({
      batchSubmitForApproval: jest
        .fn()
        .mockRejectedValue(
          new UnprocessableEntityException('No programs ready for approval'),
        ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-approval')
      .expect(422);

    expect((res.body as EndorsementErrorBody).message).toMatch(
      /No programs ready/i,
    );
  });

  it('returns 422 with blocker list when a not-yet-HEAD_REVIEWED program blocks', async () => {
    app = await buildApp({
      batchSubmitForApproval: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          message: 'Some programs are not yet ready for approval',
          blockers: [
            {
              id: 'p-2',
              name: 'Blocker Program',
              status: ProgramStatus.SUBMITTED,
            },
          ],
        }),
      ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-approval')
      .expect(422);

    const body = res.body as EndorsementErrorBody;
    expect(body.message).toMatch(/not yet ready/i);
    expect(body.blockers).toHaveLength(1);
    expect(body.blockers?.[0]).toMatchObject({
      id: 'p-2',
      status: ProgramStatus.SUBMITTED,
    });
  });

  it('returns 422 with blocker list when a FOR_REVISION program blocks', async () => {
    app = await buildApp({
      batchSubmitForApproval: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          message: 'Some programs are not yet ready for approval',
          blockers: [
            {
              id: 'p-3',
              name: 'Revision Program',
              status: ProgramStatus.FOR_REVISION,
            },
          ],
        }),
      ),
    });

    const server = app.getHttpServer() as Server;
    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-approval')
      .expect(422);

    expect((res.body as EndorsementErrorBody).blockers?.[0].status).toBe(
      ProgramStatus.FOR_REVISION,
    );
  });

  it('re-submission after all programs are PENDING_APPROVAL returns 422', async () => {
    app = await buildApp({
      batchSubmitForApproval: jest
        .fn()
        .mockResolvedValueOnce({ submitted: 2 })
        .mockRejectedValueOnce(
          new UnprocessableEntityException('No programs ready for approval'),
        ),
    });

    const server = app.getHttpServer() as Server;

    await request(server)
      .post('/aip-cycles/cycle-1/submit-for-approval')
      .expect(200)
      .expect({ submitted: 2 });

    const res = await request(server)
      .post('/aip-cycles/cycle-1/submit-for-approval')
      .expect(422);

    expect((res.body as EndorsementErrorBody).message).toMatch(
      /No programs ready/i,
    );
  });
});
