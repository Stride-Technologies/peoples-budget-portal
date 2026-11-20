import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { BudgetRollupService } from '../budget-rollup/budget-rollup.service.js';
import type { EstimateRollupService } from '../budget-rollup/estimate-rollup.service.js';
import { CommentStage, Role } from '../generated/prisma/index';
import type { OfficeScopeService } from '../permissions/office-scope.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminController } from './admin.controller.js';

const head: JwtPayload = {
  sub: 'head-a',
  role: Role.HEAD,
  email: 'head@a.test',
  firstName: 'H',
  lastName: 'A',
  identityType: null,
  officeId: 'off-a',
  civilSocietyOrganizationId: null,
};

function make() {
  const prisma = {
    programComment: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const scope = {
    officeScopeWhere: jest
      .fn()
      .mockResolvedValue({ officeId: { in: ['off-a'] } }),
    assertOfficeInScope: jest.fn((_u: JwtPayload, officeId: string | null) =>
      officeId === 'off-a'
        ? Promise.resolve()
        : Promise.reject(new ForbiddenException()),
    ),
  };
  const controller = new AdminController(
    {} as BudgetRollupService,
    {} as EstimateRollupService,
    prisma as unknown as PrismaService,
    scope as unknown as OfficeScopeService,
  );
  return { controller, prisma };
}

describe('AdminController program feedback (office scope)', () => {
  it("limits a HEAD's list to feedback on their own offices", async () => {
    const { controller, prisma } = make();
    await controller.listProgramFeedback(head);
    expect(prisma.programComment.findMany.mock.calls[0][0].where.OR).toEqual([
      { program: { officeId: { in: ['off-a'] } } },
      { budgetItem: { officeId: { in: ['off-a'] } } },
    ]);
  });

  it("refuses to mark another office's feedback reviewed", async () => {
    const { controller, prisma } = make();
    prisma.programComment.findUnique.mockResolvedValue({
      id: 'c1',
      stage: CommentStage.PUBLIC_FEEDBACK,
      parentCommentId: null,
      deletedAt: null,
      program: { officeId: 'off-b' },
      budgetItem: null,
    });
    await expect(
      controller.reviewProgramFeedback('c1', {}, head),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.programComment.update).not.toHaveBeenCalled();
  });
});
