import { Module } from '@nestjs/common';
import { AIPCodesController } from './aip-codes.controller.js';
import { AIPCodesService } from './aip-codes.service.js';

@Module({
  controllers: [AIPCodesController],
  providers: [AIPCodesService],
  exports: [AIPCodesService],
})
export class AIPCodesModule {}
