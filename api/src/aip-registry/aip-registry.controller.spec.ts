import { BadRequestException } from '@nestjs/common';
import { AIPRegistryController } from './aip-registry.controller.js';

function makeController() {
  const service = { list: jest.fn().mockResolvedValue({ items: [] }) };
  const controller = new AIPRegistryController(
    service as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, service };
}

describe('AIPRegistryController.list — thematicTagIds array cap', () => {
  it('rejects more than 20 tag ids', () => {
    const { controller } = makeController();
    const tooMany = Array.from({ length: 21 }, (_, i) => `tag-${i}`);

    expect(() =>
      controller.list(
        { sub: 'user-1' } as never,
        'ALL',
        undefined,
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

    void controller.list(
      { sub: 'user-1' } as never,
      'ALL',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      twenty,
    );

    expect(service.list.mock.calls[0][0].thematicTagIds).toEqual(twenty);
  });

  it('wraps a single string id into a one-element array', () => {
    const { controller, service } = makeController();

    void controller.list(
      { sub: 'user-1' } as never,
      'ALL',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'tag-1',
    );

    expect(service.list.mock.calls[0][0].thematicTagIds).toEqual(['tag-1']);
  });
});
