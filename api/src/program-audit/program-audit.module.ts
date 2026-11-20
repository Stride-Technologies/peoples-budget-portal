import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProgramAuditController } from './program-audit.controller.js';
import { ProgramAuditLogService } from './program-audit-log.service.js';
import { ProgramAuditQueryService } from './program-audit-query.service.js';
import { ProgramDiffService } from './program-diff.service.js';

/**
 * Global for the same reason as `PermissionsModule`: every mutation path in the
 * AIP surface writes into the edit history, and threading an import through each
 * feature module buys nothing.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ProgramAuditController],
  providers: [
    ProgramAuditLogService,
    ProgramAuditQueryService,
    ProgramDiffService,
  ],
  exports: [
    ProgramAuditLogService,
    ProgramAuditQueryService,
    ProgramDiffService,
  ],
})
export class ProgramAuditModule {}
