import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OpenDataController } from './open-data.controller.js';
import { OpenDataService } from './open-data.service.js';

// CacheModule is @Global, so CacheService needs no import here.
@Module({
  imports: [PrismaModule],
  controllers: [OpenDataController],
  providers: [OpenDataService],
})
export class OpenDataModule {}
