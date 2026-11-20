import { Module } from '@nestjs/common';
import { AIPRegistryController } from './aip-registry.controller.js';
import { AIPRegistryService } from './aip-registry.service.js';
import { ABExportService } from './ab-export.service.js';
import { AIPRegistryExportService } from './aip-registry-export.service.js';
import { AIPCompleteExportService } from './aip-complete-export.service.js';
import { LbpForm4ExportService } from './lbp-form4-export.service.js';
import { LbpForm7ExportService } from './lbp-form7-export.service.js';
import { ProgramsModule } from '../programs/programs.module.js';

@Module({
  imports: [ProgramsModule],
  controllers: [AIPRegistryController],
  providers: [
    AIPRegistryService,
    AIPRegistryExportService,
    ABExportService,
    AIPCompleteExportService,
    LbpForm4ExportService,
    LbpForm7ExportService,
  ],
})
export class AIPRegistryModule {}
