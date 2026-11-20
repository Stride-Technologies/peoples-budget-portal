import { Module } from '@nestjs/common';
import { ReferenceController } from './reference.controller.js';
import { ReferenceService } from './reference.service.js';
import { AIPCodesModule } from '../aip-codes/aip-codes.module.js';

@Module({
  // Editing a DBM office's code or type changes two segments of every AIP code
  // derived from it, so reference edits have to resync those codes.
  imports: [AIPCodesModule],
  controllers: [ReferenceController],
  providers: [ReferenceService],
})
export class ReferenceModule {}
