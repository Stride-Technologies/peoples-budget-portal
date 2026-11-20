import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsModule } from '../events/events.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { UserGrantsService } from './user-grants.service.js';

@Module({
  imports: [PrismaModule, MailModule, ConfigModule, EventsModule],
  controllers: [UsersController],
  providers: [UsersService, UserGrantsService],
})
export class UsersModule {}
