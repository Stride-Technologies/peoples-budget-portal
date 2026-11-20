import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CacheModule } from '../cache/cache.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OfficeScopeService } from './office-scope.service.js';
import { PermissionCatalogSyncService } from './permission-catalog-sync.service.js';
import { PermissionRegistry } from './permission.registry.js';
import { PermissionsController } from './permissions.controller.js';

/**
 * Global so `OfficeScopeService` can be injected by any feature service without
 * every module importing this one — office scoping applies across the whole AIP
 * surface, the same way `PrismaService` does.
 */
@Global()
@Module({
  imports: [DiscoveryModule, PrismaModule, CacheModule],
  controllers: [PermissionsController],
  providers: [
    PermissionRegistry,
    PermissionCatalogSyncService,
    OfficeScopeService,
  ],
  exports: [PermissionRegistry, OfficeScopeService],
})
export class PermissionsModule {}
