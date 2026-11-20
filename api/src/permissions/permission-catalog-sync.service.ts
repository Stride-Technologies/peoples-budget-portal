import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionRegistry } from './permission.registry.js';
import {
  PERMISSION_CATALOG,
  PERMISSION_CATALOG_KEYS,
} from './permission-catalog.js';

/**
 * Reconciles the in-code permission catalog with the `permissions` table on every
 * application bootstrap, and surfaces drift between the catalog and the
 * `@RequirePermission()` decorators discovered by `PermissionRegistry`.
 *
 * Reconciliation rules:
 *   - Catalog entries are upserted (label/description/module/enforced refreshed).
 *   - DB rows whose key left the catalog are flagged `isActive = false` rather
 *     than deleted, because `user_permissions` may still reference them.
 *   - Catalog keys with no decorator are fine when reserved, and warned about
 *     when they claim `enforced: true`.
 *   - Decorator keys missing from the catalog are warned about — the route is
 *     gated but nobody can be granted the key, which locks everyone out.
 */
@Injectable()
export class PermissionCatalogSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionCatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PermissionRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.upsertCatalog();
    await this.deactivateOrphans();
    this.warnOnRegistryDrift();
    this.warnOnEnforcedDrift();
  }

  private async upsertCatalog(): Promise<void> {
    for (const p of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { key: p.key },
        update: {
          label: p.label,
          description: p.description,
          module: p.module,
          enforced: p.enforced ?? false,
          isActive: true,
        },
        create: {
          key: p.key,
          label: p.label,
          description: p.description,
          module: p.module,
          enforced: p.enforced ?? false,
          isActive: true,
        },
      });
    }
  }

  private async deactivateOrphans(): Promise<void> {
    const orphans = await this.prisma.permission.findMany({
      where: { isActive: true, key: { notIn: [...PERMISSION_CATALOG_KEYS] } },
      select: { key: true },
    });
    if (orphans.length === 0) return;

    await this.prisma.permission.updateMany({
      where: { key: { in: orphans.map((o) => o.key) } },
      data: { isActive: false },
    });

    this.logger.warn(
      `Deactivated ${orphans.length} permission(s) absent from the catalog: ${orphans
        .map((o) => o.key)
        .join(', ')}`,
    );
  }

  /** Enforced by a decorator but not grantable from the UI — locks everyone out. */
  private warnOnRegistryDrift(): void {
    const catalog = new Set(PERMISSION_CATALOG_KEYS);
    const missing = this.registry.getKeys().filter((k) => !catalog.has(k));
    if (missing.length === 0) return;

    this.logger.warn(
      `Keys used by @RequirePermission() but missing from PERMISSION_CATALOG: ${missing.join(
        ', ',
      )}. Add them to permission-catalog.ts so they can be granted.`,
    );
  }

  /** Claims `enforced: true` but gates nothing — a lie in the control panel. */
  private warnOnEnforcedDrift(): void {
    const enforced = new Set(this.registry.getKeys());
    const unbacked = PERMISSION_CATALOG.filter(
      (p) => p.enforced && !enforced.has(p.key),
    ).map((p) => p.key);
    if (unbacked.length === 0) return;

    this.logger.warn(
      `Keys marked enforced:true in PERMISSION_CATALOG but backed by no @RequirePermission(): ${unbacked.join(
        ', ',
      )}. Wire the decorator or drop the enforced flag.`,
    );
  }
}
