import { Module } from '@nestjs/common';
import { BudgetCyclesController } from './budget-cycles.controller.js';
import { BudgetCyclesService } from './budget-cycles.service.js';

@Module({
  controllers: [BudgetCyclesController],
  providers: [BudgetCyclesService],
  exports: [BudgetCyclesService],
})
export class BudgetCyclesModule {}
