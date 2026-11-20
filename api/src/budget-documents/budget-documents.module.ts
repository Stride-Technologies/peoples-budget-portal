import { Module } from '@nestjs/common';
import { BudgetDocumentsController } from './budget-documents.controller.js';
import { BudgetDocumentsService } from './budget-documents.service.js';

@Module({
  controllers: [BudgetDocumentsController],
  providers: [BudgetDocumentsService],
  exports: [BudgetDocumentsService],
})
export class BudgetDocumentsModule {}
