import { BadRequestException } from '@nestjs/common';
import { PublicController } from './public.controller.js';

function makeController() {
  const service = { listPrograms: jest.fn().mockResolvedValue({ items: [] }) };
  const controller = new PublicController(service as never, {} as never);
  return { controller, service };
}

describe('PublicController.listPrograms — thematicTagId array cap', () => {
  it('rejects more than 20 tag ids', () => {
    const { controller } = makeController();
    const tooMany = Array.from({ length: 21 }, (_, i) => `tag-${i}`);

    expect(() =>
      controller.listPrograms(
        'cycle-1',
        undefined,
        undefined,
        undefined,
        undefined,
        tooMany,
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts exactly 20 and passes them through', () => {
    const { controller, service } = makeController();
    const twenty = Array.from({ length: 20 }, (_, i) => `tag-${i}`);

    void controller.listPrograms(
      'cycle-1',
      undefined,
      undefined,
      undefined,
      undefined,
      twenty,
    );

    expect(service.listPrograms.mock.calls[0][0].thematicTagIds).toEqual(
      twenty,
    );
  });

  it('wraps a single string id into a one-element array', () => {
    const { controller, service } = makeController();

    void controller.listPrograms(
      'cycle-1',
      undefined,
      undefined,
      undefined,
      undefined,
      'tag-1',
    );

    expect(service.listPrograms.mock.calls[0][0].thematicTagIds).toEqual([
      'tag-1',
    ]);
  });
});
