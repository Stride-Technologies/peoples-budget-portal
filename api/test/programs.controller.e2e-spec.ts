import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import type { NextFunction, Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { ProgramsController } from '../src/programs/programs.controller.js';
import { ProgramsService } from '../src/programs/programs.service.js';
import { ProgramWorkflowService } from '../src/programs/program-workflow.service.js';
import { ProgramVersionsService } from '../src/programs/program-versions.service.js';

const fakeProgram = {
  id: 'fake-id',
  tentativeAipReferenceCode: 'SAMPLE',
  name: 'Community Youth Skills Development and Employment Program',
};

describe('ProgramsController (e2e - stubbed)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    type RequestWithUser = Request & {
      user?: { id: string; role: string };
    };

    @Module({
      controllers: [ProgramsController],
      providers: [
        {
          provide: ProgramsService,
          useValue: { create: jest.fn(() => Promise.resolve(fakeProgram)) },
        },
        { provide: ProgramWorkflowService, useValue: {} },
        { provide: ProgramVersionsService, useValue: {} },
      ],
    })
    class TestModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        consumer
          .apply((req: RequestWithUser, _res, next: NextFunction) => {
            req.user = { id: 'u1', role: 'SUPER_ADMIN' };
            next();
          })
          .forRoutes('*');
      }
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('/api/v1/programs (POST) returns created program', async () => {
    const payload = {
      aipCycleId: 'any',
      proponentType: 'LGU',
      officeId: 'any',
      papSectorId: 'any',
      finishLineId: 'any',
      name: 'Community Youth Skills Development and Employment Program',
      expectedOutput:
        'At least 300 youth and unemployed residents trained and certified in technical and livelihood skills, with 40% successfully employed or engaged in income-generating activities within one year.',
    };

    const server = app.getHttpServer() as Server;

    await request(server)
      .post('/api/v1/programs')
      .send(payload)
      .expect(201)
      .expect((res: { body: { id?: string } }) => {
        if (res.body.id !== fakeProgram.id)
          throw new Error('unexpected response');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
