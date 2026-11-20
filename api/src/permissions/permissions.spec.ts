import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma/index';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { CacheService } from '../cache/cache.service.js';
import { MemoryCacheStore } from '../cache/memory-cache.store.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { ALL_OFFICES, OfficeScopeService } from './office-scope.service.js';
import { PermissionsController } from './permissions.controller.js';
import {
  PERMISSION_CATALOG,
  PERMISSION_CATALOG_KEYS,
  PERMISSION_TEMPLATES,
} from './permission-catalog.js';

const user = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'u1',
  role: Role.STAFF,
  email: 'a@b.c',
  firstName: 'A',
  lastName: 'B',
  identityType: null,
  officeId: null,
  civilSocietyOrganizationId: null,
  permissions: [],
  allOfficesScope: false,
  ...over,
});

const contextFor = (u?: JwtPayload): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: u }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as unknown as ExecutionContext;

/** Reflector stub: first lookup is @Public, second is @RequirePermission. */
const reflectorWith = (isPublic: boolean, required?: string): Reflector =>
  ({
    getAllAndOverride: jest
      .fn()
      .mockReturnValueOnce(isPublic)
      .mockReturnValueOnce(required),
  }) as unknown as Reflector;

describe('PermissionGuard', () => {
  const grantFound = {
    userPermission: { findUnique: jest.fn().mockResolvedValue({ key: 'k' }) },
  } as unknown as PrismaService;
  const grantMissing = {
    userPermission: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  it('allows a @Public route with no token at all', async () => {
    const guard = new PermissionGuard(reflectorWith(true), grantMissing);
    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
  });

  it('allows a route carrying no @RequirePermission (unmigrated route)', async () => {
    const guard = new PermissionGuard(reflectorWith(false), grantMissing);
    await expect(guard.canActivate(contextFor(user()))).resolves.toBe(true);
  });

  it('lets SUPER_ADMIN through without a grant', async () => {
    const guard = new PermissionGuard(
      reflectorWith(false, 'aip:publish'),
      grantMissing,
    );
    await expect(
      guard.canActivate(contextFor(user({ role: Role.SUPER_ADMIN }))),
    ).resolves.toBe(true);
  });

  it('allows when the key is in the token', async () => {
    const guard = new PermissionGuard(
      reflectorWith(false, 'aip:write'),
      grantMissing,
    );
    await expect(
      guard.canActivate(contextFor(user({ permissions: ['aip:write'] }))),
    ).resolves.toBe(true);
  });

  it('falls back to the DB so a just-granted key works without re-login', async () => {
    const guard = new PermissionGuard(
      reflectorWith(false, 'aip:write'),
      grantFound,
    );
    await expect(guard.canActivate(contextFor(user()))).resolves.toBe(true);
  });

  it('denies when the key is in neither the token nor the DB', async () => {
    const guard = new PermissionGuard(
      reflectorWith(false, 'aip:publish'),
      grantMissing,
    );
    await expect(guard.canActivate(contextFor(user()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies a token with no permissions claim rather than trusting it', async () => {
    // Tokens issued before this shipped carry no `permissions`; absent must send
    // the guard to the DB, not wave the request through.
    const guard = new PermissionGuard(
      reflectorWith(false, 'aip:publish'),
      grantMissing,
    );
    const legacy = user();
    delete legacy.permissions;
    await expect(guard.canActivate(contextFor(legacy))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('OfficeScopeService', () => {
  const prismaWith = (grants: string[], home: string[]) =>
    ({
      userOfficeScope: {
        findMany: jest
          .fn()
          .mockResolvedValue(grants.map((officeId) => ({ officeId }))),
      },
      lGUUser: {
        findMany: jest
          .fn()
          .mockResolvedValue(home.map((officeId) => ({ officeId }))),
      },
    }) as unknown as PrismaService;

  const make = (grants: string[], home: string[]) =>
    new OfficeScopeService(
      prismaWith(grants, home),
      new CacheService(new MemoryCacheStore()),
    );

  it('gives SUPER_ADMIN every office without touching the grant tables', async () => {
    const prisma = prismaWith([], []);
    const svc = new OfficeScopeService(
      prisma,
      new CacheService(new MemoryCacheStore()),
    );
    await expect(
      svc.effectiveOfficeIds(user({ role: Role.SUPER_ADMIN })),
    ).resolves.toBe(ALL_OFFICES);
    expect(prisma.userOfficeScope.findMany).not.toHaveBeenCalled();
  });

  it('honours the allOfficesScope fast path', async () => {
    await expect(
      make([], []).effectiveOfficeIds(user({ allOfficesScope: true })),
    ).resolves.toBe(ALL_OFFICES);
  });

  it('unions explicit grants with the home office, de-duplicated', async () => {
    const ids = await make(['o1', 'o2'], ['o2', 'o3']).effectiveOfficeIds(
      user(),
    );
    expect([...(ids as string[])].sort()).toEqual(['o1', 'o2', 'o3']);
  });

  it('preserves existing access for a user with no grants at all', async () => {
    // The no-backfill guarantee: home office alone still resolves.
    await expect(
      make([], ['home']).effectiveOfficeIds(user()),
    ).resolves.toEqual(['home']);
  });

  it('assertOfficeInScope throws for an office outside the scope', async () => {
    const svc = make(['o1'], []);
    await expect(
      svc.assertOfficeInScope(user(), 'o1'),
    ).resolves.toBeUndefined();
    await expect(svc.assertOfficeInScope(user(), 'o9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.assertOfficeInScope(user(), null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('officeScopeWhere matches nothing — not everything — for an unscoped user', async () => {
    await expect(make([], []).officeScopeWhere(user())).resolves.toEqual({
      officeId: { in: [] },
    });
  });

  it('officeScopeWhere is an empty fragment for ALL', async () => {
    await expect(
      make([], []).officeScopeWhere(user({ allOfficesScope: true })),
    ).resolves.toEqual({});
  });

  describe('GET /permissions/me/offices', () => {
    it('reports the scoped office list, so the UI can offer those offices', async () => {
      const ctl = new PermissionsController(make(['o1'], ['home']));
      const res = await ctl.getMyOffices(user());
      expect(res.allOffices).toBe(false);
      expect([...res.officeIds].sort()).toEqual(['home', 'o1']);
    });

    it('reports allOffices without a list for an all-offices user', async () => {
      const ctl = new PermissionsController(make([], []));
      await expect(
        ctl.getMyOffices(user({ allOfficesScope: true })),
      ).resolves.toEqual({ allOffices: true, officeIds: [] });
    });
  });
});

describe('permission catalog', () => {
  it('has no duplicate keys', () => {
    expect(new Set(PERMISSION_CATALOG_KEYS).size).toBe(
      PERMISSION_CATALOG_KEYS.length,
    );
  });

  it('only references catalog keys from the templates', () => {
    const known = new Set(PERMISSION_CATALOG_KEYS);
    for (const [name, keys] of Object.entries(PERMISSION_TEMPLATES)) {
      const unknown = keys.filter((k) => !known.has(k));
      expect({ name, unknown }).toEqual({ name, unknown: [] });
    }
  });

  it('isolates aip:publish to the CPDO Head template (§6)', () => {
    const withPublish = Object.entries(PERMISSION_TEMPLATES)
      .filter(([, keys]) => keys.includes('aip:publish'))
      .map(([name]) => name);
    expect(withPublish).toEqual(['CPDO Head']);
  });

  it('keeps the Office Head template read-only on AIP records (D20)', () => {
    expect(PERMISSION_TEMPLATES['Office Head / Representative']).not.toContain(
      'aip:write',
    );
  });

  it('marks the Phase 2 keys as reserved, never enforced', () => {
    const reserved = [
      'line_items:read',
      'line_items:write',
      'approvals:decide',
      'endorsements:record',
    ];
    for (const key of reserved) {
      const entry = PERMISSION_CATALOG.find((p) => p.key === key);
      expect(entry?.enforced ?? false).toBe(false);
    }
  });
});

describe('catalog vs the routes that actually exist', () => {
  /**
   * `PermissionCatalogSyncService` warns about this drift at boot — but only
   * when the app boots against a database, which CI does not do. `aip:publish`
   * and `aip:audit` sat marked "not enforced yet" for several phases after their
   * routes shipped, and the only thing that caught it was someone reading the
   * control panel. This test is the cheap version of that check.
   */
  const controllerSrc = globSync(join(__dirname, '..', '**', '*.controller.ts'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  const decorated = new Set(
    [...controllerSrc.matchAll(/@RequirePermission\(\s*'([^']+)'\s*\)/g)].map(
      (m) => m[1],
    ),
  );

  it('marks every key with a route as enforced', () => {
    const understated = PERMISSION_CATALOG.filter(
      (p) => decorated.has(p.key) && !p.enforced,
    ).map((p) => p.key);

    // A key gating a live route but flagged "not enforced yet" tells admins the
    // grant is inert when it is doing real work.
    expect(understated).toEqual([]);
  });

  it('does not claim enforcement for a key with no route', () => {
    const overstated = PERMISSION_CATALOG.filter(
      (p) => p.enforced && !decorated.has(p.key),
    ).map((p) => p.key);

    expect(overstated).toEqual([]);
  });

  it('only decorates keys that exist in the catalog', () => {
    // A route gated on a key nobody can be granted locks everyone out.
    const unknown = [...decorated].filter(
      (k) => !PERMISSION_CATALOG_KEYS.includes(k),
    );
    expect(unknown).toEqual([]);
  });
});
