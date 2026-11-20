import { Module } from '@nestjs/common';
import { ProjectActivitiesController } from './project-activities.controller.js';
import { ProjectActivitiesService } from './project-activities.service.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { AIPCodesModule } from '../aip-codes/aip-codes.module.js';
import { BudgetRollupModule } from '../budget-rollup/budget-rollup.module.js';

@Module({
  imports: [ProgramsModule, AIPCodesModule, BudgetRollupModule],
  controllers: [ProjectActivitiesController],
  providers: [ProjectActivitiesService],
  exports: [ProjectActivitiesService],
})
export class ProjectActivitiesModule {}
