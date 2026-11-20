import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './decorators/require-permission.decorator.js';

/**
 * Discovers every permission key declared by a `@RequirePermission()` decorator,
 * so `PermissionCatalogSyncService` can cross-check the catalog against what the
 * code actually enforces — in both directions:
 *
 *   - a key enforced by a decorator but absent from the catalog cannot be granted
 *     from the control panel, which locks everyone out of that route;
 *   - a catalog key marked `enforced: true` with no decorator anywhere gates
 *     nothing, which is a lie in the UI.
 *
 * Both are warnings at boot, never a hard failure: a documentation-flag mismatch
 * must not take the API down.
 */
@Injectable()
export class PermissionRegistry implements OnApplicationBootstrap {
  private readonly keys = new Set<string>();
  /**
   * NestJS Swagger generates operationIds as `${ControllerClass}_${methodName}`;
   * mirrored here so `tools/generate-api-routes.mjs` can map a route back to its
   * required permission for the docs table.
   */
  private readonly operationKeys = new Map<string, string>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    for (const wrapper of this.discovery.getControllers()) {
      const instance: unknown = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance) as object;
      const controller = prototype as Record<
        string,
        ((...args: unknown[]) => unknown) | undefined
      >;
      const constructor = (instance as { constructor?: object }).constructor;
      const className = (instance as { constructor?: { name?: string } })
        .constructor?.name;

      // Class-level @RequirePermission() applies to every handler unless the
      // handler declares its own. Read both, prefer handler-level.
      const classKey = constructor
        ? this.reflector.get<string | undefined>(
            PERMISSION_KEY,
            constructor as (...args: never[]) => unknown,
          )
        : undefined;

      this.metadataScanner.scanFromPrototype(
        instance as Record<string, unknown>,
        prototype,
        (methodName: string) => {
          const handler = controller[methodName];
          if (!handler) return;

          const methodKey = this.reflector.get<string | undefined>(
            PERMISSION_KEY,
            handler,
          );
          const key = methodKey ?? classKey;
          if (!key) return;

          this.keys.add(key);
          if (className) {
            this.operationKeys.set(`${className}_${methodName}`, key);
          }
        },
      );
    }
  }

  getKeys(): string[] {
    return [...this.keys].sort();
  }

  getKeyForOperation(operationId: string): string | undefined {
    return this.operationKeys.get(operationId);
  }
}
