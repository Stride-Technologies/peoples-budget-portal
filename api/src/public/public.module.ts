import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PublicController } from './public.controller.js';
import { PublicService } from './public.service.js';
import { RecaptchaGuard } from './guards/recaptcha.guard.js';
import { HoneypotInterceptor } from './interceptors/honeypot.interceptor.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [PublicService, RecaptchaGuard, HoneypotInterceptor],
})
export class PublicModule {}
