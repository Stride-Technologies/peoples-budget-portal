import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwksController } from './jwks.controller.js';

@Module({
  imports: [JwtModule.register({}), PrismaModule, MailModule, ConfigModule],
  controllers: [AuthController, JwksController],
  providers: [AuthService],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
