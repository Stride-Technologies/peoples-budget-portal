import 'reflect-metadata';
import { METHOD_METADATA } from '@nestjs/common/constants';
import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
} from '@nestjs/throttler/dist/throttler.constants';
import { ExplorerLogController } from './explorer-log.controller.js';
import { ExplorerController } from './explorer.controller.js';

/**
 * design §12: every explorer route is rate limited. A new endpoint without its
 * own `@Throttle` fails here, before it reaches the public.
 */
describe.each([ExplorerController, ExplorerLogController])(
  '%p rate limits',
  (ctrl) => {
    const routes = Object.getOwnPropertyNames(ctrl.prototype).filter(
      (name) =>
        Reflect.getMetadata(
          METHOD_METADATA,
          ctrl.prototype[name as keyof typeof ctrl.prototype] as object,
        ) !== undefined,
    );

    it('has routes', () => expect(routes.length).toBeGreaterThan(0));

    it.each(routes)('%s declares @Throttle and is never skipped', (name) => {
      const handler = ctrl.prototype[
        name as keyof typeof ctrl.prototype
      ] as object;
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toEqual(
        expect.any(Number),
      );
      expect(
        Reflect.getMetadata(`${THROTTLER_SKIP}default`, handler),
      ).toBeFalsy();
      expect(Reflect.getMetadata(`${THROTTLER_SKIP}default`, ctrl)).toBeFalsy();
    });
  },
);
