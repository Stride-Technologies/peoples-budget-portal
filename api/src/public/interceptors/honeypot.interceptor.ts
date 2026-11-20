import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { of } from 'rxjs';
import type { Observable } from 'rxjs';

// Returns a silent 200 { success: true } when RecaptchaGuard marked the
// request as a honeypot hit — bots get no signal to adapt (D23).
@Injectable()
export class HoneypotInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { _honeypotHit?: boolean }>();
    if (req._honeypotHit) {
      return of({ success: true });
    }
    return next.handle();
  }
}
