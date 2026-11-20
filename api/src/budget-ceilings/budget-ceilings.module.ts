import { Module } from '@nestjs/common';
import { BudgetCeilingsController } from './budget-ceilings.controller.js';
import { BudgetCeilingsService } from './budget-ceilings.service.js';

@Module({
  controllers: [BudgetCeilingsController],
  providers: [BudgetCeilingsService],
  exports: [BudgetCeilingsService],
})
export class BudgetCeilingsModule {}
