import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentsService } from './comments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProgramsService } from '../programs/programs.service.js';
import type { EventsService } from '../events/events.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { CommentStage, Role } from '../generated/prisma/index';

function user(over: Partial<JwtPayload>): JwtPayload {
  return {
    sub: 'u-1',
    role: Role.STAFF,
    email: 'u@x.com',
    firstName: 'U',
    lastName: 'One',
    identityType: null,
    officeId: null,
    civilSocietyOrganizationId: null,
    ...over,
  };
}

describe('CommentsService', () => {
  let prisma: {
    programComment: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    program: { findUnique: jest.Mock };
    userPermission: { findUnique: jest.Mock };
    office: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let events: { emitProgramEvent: jest.Mock };
  let programs: { assertCanRead: jest.Mock };
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      programComment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      program: { findUnique: jest.fn() },
      userPermission: { findUnique: jest.fn().mockResolvedValue(null) },
      office: { findUnique: jest.fn() },
      // Comment mutations now commit their audit row in the same transaction,
      // so the mock has to behave like one.
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    events = { emitProgramEvent: jest.fn() };
    programs = { assertCanRead: jest.fn().mockResolvedValue(undefined) };
    service = new CommentsService(
      prisma as unknown as PrismaService,
      programs as unknown as ProgramsService,
      events as unknown as EventsService,
      { record: jest.fn().mockResolvedValue(null) },
    );
  });

  describe("submitter identity (residents' names and emails)", () => {
    it('is omitted from the staff comment list', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prisma.programComment as unknown as Record<string, jest.Mock>).findMany =
        findMany;
      (prisma as unknown as Record<string, unknown>).user = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      await service.list('p-1', {}, user({}));
      expect(findMany.mock.calls[0][0].omit).toEqual({
        submitterName: true,
        submitterEmail: true,
      });
    });
  });

  describe('setResolved', () => {
    it('rejects resolving a reply (only root threads are resolvable)', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        parentCommentId: 'root-1',
        programId: 'p-1',
        authorUserId: 'u-1',
      });
      await expect(
        service.setResolved('c-1', true, undefined, user({})),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for a missing comment', async () => {
      prisma.programComment.findUnique.mockResolvedValue(null);
      await expect(
        service.setResolved('missing', true, undefined, user({})),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids a non-owner, non-author from resolving', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        parentCommentId: null,
        programId: 'p-1',
        authorUserId: 'someone-else',
      });
      prisma.program.findUnique.mockResolvedValue({
        officeId: 'office-A',
        civilSocietyOrganizationId: null,
      });
      await expect(
        service.setResolved(
          'c-1',
          true,
          undefined,
          user({ sub: 'u-1', officeId: 'office-B' }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the original commenter resolve their own thread', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        parentCommentId: null,
        programId: 'p-1',
        authorUserId: 'u-1',
      });
      prisma.program.findUnique.mockResolvedValue({
        officeId: 'office-A',
        civilSocietyOrganizationId: null,
      });
      prisma.programComment.update.mockResolvedValue({ id: 'c-1' });

      await service.setResolved('c-1', true, undefined, user({ sub: 'u-1' }));

      expect(prisma.programComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1' },

          data: expect.objectContaining({ resolvedByUserId: 'u-1' }),
        }),
      );
      expect(events.emitProgramEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'comment.resolved', programId: 'p-1' }),
      );
    });

    it('lets the proponent office resolve a thread it did not author', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        parentCommentId: null,
        programId: 'p-1',
        authorUserId: 'reviewer-9',
      });
      prisma.program.findUnique.mockResolvedValue({
        officeId: 'office-A',
        civilSocietyOrganizationId: null,
      });
      prisma.programComment.update.mockResolvedValue({ id: 'c-1' });

      await service.setResolved(
        'c-1',
        true,
        undefined,
        user({ sub: 'proponent-1', officeId: 'office-A' }),
      );

      expect(prisma.programComment.update).toHaveBeenCalled();
    });
  });

  describe('remove (soft delete)', () => {
    it('soft-deletes the comment and its reply subtree via updateMany', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        programId: 'p-1',
        budgetItemId: null,
        authorUserId: 'u-1',
        deletedAt: null,
      });
      prisma.programComment.updateMany.mockResolvedValue({ count: 1 });

      await service.remove('c-1', user({ sub: 'u-1' }));

      expect(prisma.programComment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ id: 'c-1' }, { parentCommentId: 'c-1' }],
            deletedAt: null,
          },
          data: expect.objectContaining({ deletedByUserId: 'u-1' }),
        }),
      );
      const arg = prisma.programComment.updateMany.mock.calls[0][0] as {
        data: { deletedAt: Date };
      };
      expect(arg.data.deletedAt).toBeInstanceOf(Date);
    });

    it('treats an already-deleted comment as not found', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        authorUserId: 'u-1',
        deletedAt: new Date(),
      });
      await expect(service.remove('c-1', user({ sub: 'u-1' }))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('forbids a non-author, non-SUPER_ADMIN from deleting', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        authorUserId: 'someone-else',
        deletedAt: null,
      });
      await expect(
        service.remove('c-1', user({ sub: 'u-1', role: Role.STAFF })),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('restore', () => {
    it('forbids a non-SUPER_ADMIN from restoring', async () => {
      await expect(
        service.restore('c-1', user({ role: Role.STAFF })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('restores the comment and its reply subtree', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        programId: 'p-1',
        budgetItemId: null,
        deletedAt: new Date(),
      });
      prisma.programComment.updateMany.mockResolvedValue({ count: 2 });

      await service.restore('c-1', user({ role: Role.SUPER_ADMIN }));

      expect(prisma.programComment.updateMany).toHaveBeenCalledWith({
        where: { OR: [{ id: 'c-1' }, { parentCommentId: 'c-1' }] },
        data: { deletedAt: null, deletedByUserId: null },
      });
    });

    it('is a no-op for a comment that is not deleted', async () => {
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-1',
        deletedAt: null,
      });
      const res = await service.restore(
        'c-1',
        user({ role: Role.SUPER_ADMIN }),
      );
      expect(res).toEqual({ message: 'Comment is not deleted.' });
      expect(prisma.programComment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('who may comment', () => {
    const writer = (over: Partial<JwtPayload> = {}) =>
      user({ officeId: 'office-A', permissions: ['comments:write'], ...over });

    beforeEach(() => {
      prisma.program.findUnique.mockResolvedValue({
        officeId: 'office-A',
        currentVersion: 0,
      });
    });

    it('lets a reader with comments:write comment', async () => {
      await expect(service.canComment('p-1', writer())).resolves.toBe(true);
      expect(programs.assertCanRead).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ sub: 'u-1' }),
      );
    });

    it('does not depend on role or program status', async () => {
      // The archived workflow let only the owning HEAD comment on a SUBMITTED
      // program; an Office Head of a scoped office could not comment at all.
      await expect(
        service.canComment(
          'p-1',
          writer({ role: Role.HEAD, officeId: 'office-B' }),
        ),
      ).resolves.toBe(true);
    });

    it('refuses a reader without comments:write', async () => {
      await expect(
        service.canComment('p-1', writer({ permissions: ['comments:read'] })),
      ).resolves.toBe(false);
    });

    it('accepts comments:write granted after the token was issued', async () => {
      prisma.userPermission.findUnique.mockResolvedValue({
        key: 'comments:write',
      });
      await expect(
        service.canComment('p-1', writer({ permissions: [] })),
      ).resolves.toBe(true);
    });

    it('lets a reader with no office of their own comment — an NCPC reviewer (#102)', async () => {
      await expect(
        service.canComment(
          'p-1',
          writer({
            officeId: null,
            identityType: 'NCPC' as JwtPayload['identityType'],
          }),
        ),
      ).resolves.toBe(true);
    });

    it('refuses a caller who cannot read the program', async () => {
      programs.assertCanRead.mockRejectedValue(new ForbiddenException());
      await expect(service.canComment('p-1', writer())).resolves.toBe(false);
    });

    it('create refuses with 403 where canComment says no', async () => {
      await expect(
        service.create('p-1', { content: 'hi' }, writer({ permissions: [] })),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.programComment.create).not.toHaveBeenCalled();
    });

    it('stores every staff comment as GENERAL', async () => {
      prisma.programComment.create.mockResolvedValue({
        id: 'c-1',
        parentCommentId: null,
      });
      await service.create(
        'p-1',
        { content: 'hi' },
        writer({ role: Role.HEAD }),
      );
      expect(prisma.programComment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stage: CommentStage.GENERAL }),
      });
    });
  });

  // specs/012 D3 / eng review 2A: comments on a PPA in an LEP or Ordinance use
  // the same office rule as programs, through one shared check.
  describe('assertCanReadTarget (document PPAs)', () => {
    const office = (id: string) => ({ id, clusterId: `cl-${id}` });
    function withItem(item: unknown, readable: string[]) {
      (prisma as unknown as { budgetItem: unknown }).budgetItem = {
        findUnique: jest.fn().mockResolvedValue(item),
      };
      (programs as unknown as { canReadOffice: jest.Mock }).canReadOffice =
        jest.fn((officeId: string) =>
          Promise.resolve(readable.includes(officeId)),
        );
    }

    it('allows a reader of the PPA office', async () => {
      withItem({ office: office('A'), hostOffice: null }, ['A']);
      await expect(
        service.assertCanReadTarget({ budgetItemId: 'i-1' }, user({})),
      ).resolves.toBeUndefined();
    });

    it('allows a reader of the host office (component programs)', async () => {
      withItem({ office: office('A'), hostOffice: office('H') }, ['H']);
      await expect(
        service.assertCanReadTarget({ budgetItemId: 'i-1' }, user({})),
      ).resolves.toBeUndefined();
    });

    it('refuses a user who can read neither office (including an empty scope)', async () => {
      withItem({ office: office('A'), hostOffice: null }, []);
      await expect(
        service.assertCanReadTarget({ budgetItemId: 'i-1' }, user({})),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s a missing PPA', async () => {
      withItem(null, ['A']);
      await expect(
        service.assertCanReadTarget({ budgetItemId: 'nope' }, user({})),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses the program rule for a program target', async () => {
      await service.assertCanReadTarget({ programId: 'p-1' }, user({}));
      expect(programs.assertCanRead).toHaveBeenCalledWith(
        'p-1',
        expect.anything(),
      );
    });

    it("records a document-PPA comment's deletion in the document history", async () => {
      const create = jest.fn().mockResolvedValue({});
      Object.assign(prisma, {
        budgetItem: {
          findUnique: jest.fn().mockResolvedValue({ documentId: 'doc-1' }),
        },
        budgetDocumentAuditLog: { create },
      });
      prisma.programComment.findUnique.mockResolvedValue({
        id: 'c-9',
        programId: null,
        budgetItemId: 'i-1',
        authorUserId: 'u-1',
        deletedAt: null,
      });
      prisma.programComment.updateMany.mockResolvedValue({ count: 1 });
      await service.remove('c-9', user({ sub: 'u-1' }));
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          itemId: 'i-1',
          action: 'COMMENT',
          detail: expect.objectContaining({
            event: 'COMMENT_DELETED',
            commentId: 'c-9',
          }),
        }),
      });
      expect(events.emitProgramEvent).not.toHaveBeenCalled();
    });
  });
});
