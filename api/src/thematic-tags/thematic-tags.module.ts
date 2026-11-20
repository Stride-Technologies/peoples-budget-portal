import { Module } from '@nestjs/common';
import { ThematicTagsController } from './thematic-tags.controller.js';
import { ThematicTagsService } from './thematic-tags.service.js';

@Module({
  controllers: [ThematicTagsController],
  providers: [ThematicTagsService],
  exports: [ThematicTagsService],
})
export class ThematicTagsModule {}
