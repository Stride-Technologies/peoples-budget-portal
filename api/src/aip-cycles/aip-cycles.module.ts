import { Module } from '@nestjs/common';
import { AIPCyclesController } from './aip-cycles.controller.js';
import { AIPCyclesService } from './aip-cycles.service.js';
import { SpecialFundsService } from './special-funds.service.js';
import { AipExtendedService } from './aip-extended.service.js';
import { ProgramsModule } from '../programs/programs.module.js';

@Module({
  imports: [ProgramsModule],
  controllers: [AIPCyclesController],
  providers: [AIPCyclesService, SpecialFundsService, AipExtendedService],
  exports: [AIPCyclesService, SpecialFundsService],
})
export class AIPCyclesModule {}
