import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Display identity for a comment author or resolver. The drawer renders
 * name + office + position (role) on every comment.
 */
export interface CommentActor {
  id: string;
  name: string;
  role: string;
  office: string | null;
}

/**
 * Batch-load display identities for a set of user ids. A user's office is
 * their Office (LGU track) or CivilSocietyOrganization (NCPC track);
 * SUPER_ADMINs have neither and resolve to `office: null`.
 */
/**
 * A resident's name and email on PUBLIC_FEEDBACK rows are personal data for the
 * moderation routes (`public_comments:view`) only. Every staff comment read
 * omits them, so `aip:read` / `comments:read` never carries them.
 */
export const OMIT_SUBMITTER = {
  submitterName: true,
  submitterEmail: true,
} as const;

export async function loadCommentActors(
  prisma: PrismaService,
  userIds: (string | null | undefined)[],
): Promise<Map<string, CommentActor>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, CommentActor>();
  if (ids.length === 0) return map;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      lguusers: {
        select: { office: { select: { name: true } } },
      },
      ncpcusers: {
        select: { civilSocietyOrganization: { select: { name: true } } },
      },
    },
  });

  for (const u of users) {
    const office =
      u.lguusers[0]?.office?.name ??
      u.ncpcusers[0]?.civilSocietyOrganization?.name ??
      null;
    map.set(u.id, {
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      role: u.role,
      office,
    });
  }
  return map;
}
