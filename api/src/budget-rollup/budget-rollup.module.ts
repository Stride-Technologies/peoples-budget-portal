import { Module } from '@nestjs/common';
import { BudgetRollupService } from './budget-rollup.service.js';
import { EstimateRollupService } from './estimate-rollup.service.js';

@Module({
  providers: [BudgetRollupService, EstimateRollupService],
  exports: [BudgetRollupService, EstimateRollupService],
})
export class BudgetRollupModule {}
