import { Module } from '@nestjs/common';
import { ProgramsController } from './programs.controller.js';
import { ProgramsService } from './programs.service.js';
import { ProgramWorkflowService } from './program-workflow.service.js';
import { ProgramVersionsService } from './program-versions.service.js';
import { ProgramPublishService } from './program-publish.service.js';
import { AIPCodesModule } from '../aip-codes/aip-codes.module.js';
import { BudgetCeilingsModule } from '../budget-ceilings/budget-ceilings.module.js';
import { EventsModule } from '../events/events.module.js';
import { BudgetRollupModule } from '../budget-rollup/budget-rollup.module.js';

@Module({
  imports: [
    AIPCodesModule,
    BudgetCeilingsModule,
    EventsModule,
    BudgetRollupModule,
  ],
  controllers: [ProgramsController],
  providers: [
    ProgramsService,
    ProgramWorkflowService,
    ProgramVersionsService,
    ProgramPublishService,
  ],
  exports: [
    ProgramsService,
    ProgramWorkflowService,
    ProgramVersionsService,
    ProgramPublishService,
  ],
})
export class ProgramsModule {}
