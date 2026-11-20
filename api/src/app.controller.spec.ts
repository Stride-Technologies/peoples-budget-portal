import { HealthCheckService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaHealthIndicator } from './health/prisma.health';
import { RedisHealthIndicator } from './health/redis.health';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: jest.fn().mockResolvedValue({ status: 'ok' }) },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: {
            isHealthy: jest
              .fn()
              .mockResolvedValue({ database: { status: 'up' } }),
          },
        },
        {
          provide: RedisHealthIndicator,
          useValue: {
            isHealthy: jest.fn().mockResolvedValue({
              cache: { status: 'up', redis: 'disabled' },
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('check', () => {
    it('should return health status', async () => {
      const result = await appController.check();
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
