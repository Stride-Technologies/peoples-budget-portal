import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC } from '../decorators/public.decorator.js';
import type { JwtPayload } from '../decorators/current-user.decorator.js';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const token = this.extractBearerToken(request);

    if (!token) throw new UnauthorizedException('Missing access token');

    try {
      const publicKey = this.config
        .getOrThrow<string>('JWT_PUBLIC_KEY')
        .replace(/\\n/g, '\n');

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: publicKey,
        algorithms: ['RS256'],
      });
      // The office claim was renamed `cityOfficeId` → `officeId` when the two
      // office tables were consolidated. Tokens minted before that deploy are
      // still valid until they expire, so accept the old claim here — the one
      // place every authenticated request passes through — rather than teaching
      // every consumer about both spellings.
      // ponytail: delete this fallback once one access-token TTL has elapsed.
      payload.officeId ??=
        (payload as { cityOfficeId?: string | null }).cityOfficeId ?? null;
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
