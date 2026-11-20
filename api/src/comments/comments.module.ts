import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { EventsModule } from '../events/events.module.js';

@Module({
  imports: [ProgramsModule, EventsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
