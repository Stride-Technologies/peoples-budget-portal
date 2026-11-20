import { Module } from '@nestjs/common';
import { PpmpController } from './ppmp.controller.js';
import { PpmpService } from './ppmp.service.js';
import { PpmpExportService } from './ppmp-export.service.js';

@Module({
  controllers: [PpmpController],
  providers: [PpmpService, PpmpExportService],
  exports: [PpmpService],
})
export class PpmpModule {}
