import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller.js';
import type { MessageResponse, TokenPair } from '../src/auth/auth.service.js';
import { AuthService } from '../src/auth/auth.service.js';

type RequestWithUser = Request & { user?: object };

const fakeTokenPair: TokenPair = {
  accessToken: 'access.jwt.token',
  refreshToken: 'raw-hex-refresh-token',
};
const rotatedPair: TokenPair = {
  accessToken: 'new.access.token',
  refreshToken: 'new-hex-refresh-token',
};

// Module-level mocks typed via MockedFunction so .mockResolvedValue() is known to TS.
const authService = {
  login: jest.fn() as jest.MockedFunction<AuthService['login']>,
  refresh: jest.fn() as jest.MockedFunction<AuthService['refresh']>,
  logout: jest.fn() as jest.MockedFunction<AuthService['logout']>,
};

describe('AuthController — token lifecycle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    @Module({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
    class TestModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        consumer
          .apply((req: RequestWithUser, _res: Response, next: NextFunction) => {
            req.user = {
              sub: 'u1',
              role: 'STAFF',
              email: 'test@example.gov.ph',
            };
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const server = () => app.getHttpServer() as Server;

  describe('POST /auth/login', () => {
    it('returns 200 with an access + refresh token pair', async () => {
      authService.login.mockResolvedValue(fakeTokenPair);

      await request(server())
        .post('/auth/login')
        .send({ email: 'test@example.gov.ph', password: 'Password123!' }) // NOSONAR
        .expect(200)
        .expect(fakeTokenPair);
    });

    it('returns 401 when credentials are invalid', async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await request(server())
        .post('/auth/login')
        .send({ email: 'person2@example.gov.ph', password: 'wrong' }) // NOSONAR
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 200 with a rotated token pair', async () => {
      authService.refresh.mockResolvedValue(rotatedPair);

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: fakeTokenPair.refreshToken })
        .expect(200)
        .expect(rotatedPair);
    });

    it('returns 401 when the refresh token is revoked or expired', async () => {
      authService.refresh.mockRejectedValue(
        new UnauthorizedException('Refresh token has expired or been revoked'),
      );

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: 'stale-or-revoked-token' })
        .expect(401);
    });

    it('returns 401 when the refresh token does not exist', async () => {
      authService.refresh.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: 'nonexistent-token' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 200 and calls service with the raw refresh token', async () => {
      const expected: MessageResponse = { message: 'Logged out' };
      authService.logout.mockResolvedValue(expected);

      await request(server())
        .post('/auth/logout')
        .set('Authorization', 'Bearer any-access-token')
        .send({ refreshToken: fakeTokenPair.refreshToken })
        .expect(200)
        .expect(expected);

      expect(authService.logout).toHaveBeenCalledWith(
        fakeTokenPair.refreshToken,
      );
    });
  });
});
