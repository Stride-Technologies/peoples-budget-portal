import { Module } from '@nestjs/common';
import { ClimateTagsController } from './climate-tags.controller.js';
import { ClimateTagsService } from './climate-tags.service.js';
import { ProgramsModule } from '../programs/programs.module.js';

@Module({
  imports: [ProgramsModule],
  controllers: [ClimateTagsController],
  providers: [ClimateTagsService],
  exports: [ClimateTagsService],
})
export class ClimateTagsModule {}
