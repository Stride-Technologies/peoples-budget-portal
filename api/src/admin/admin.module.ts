import { Module } from '@nestjs/common';
import { BudgetRollupModule } from '../budget-rollup/budget-rollup.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [BudgetRollupModule],
  controllers: [AdminController],
})
export class AdminModule {}
