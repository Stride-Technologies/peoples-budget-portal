import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LguController } from './lgu.controller.js';
import { LguService } from './lgu.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [LguController],
  providers: [LguService],
})
export class LguModule {}
