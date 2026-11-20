import { Module } from '@nestjs/common';
import { LineItemsController } from './line-items.controller.js';
import { LineItemsService } from './line-items.service.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { BudgetRollupModule } from '../budget-rollup/budget-rollup.module.js';

@Module({
  imports: [ProgramsModule, BudgetRollupModule],
  controllers: [LineItemsController],
  providers: [LineItemsService],
  exports: [LineItemsService],
})
export class LineItemsModule {}
