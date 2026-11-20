import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { CreateThematicTagDto } from './dto/create-thematic-tag.dto.js';
import type { UpdateThematicTagDto } from './dto/update-thematic-tag.dto.js';

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Plain Levenshtein edit distance. Small catalog (dozens to low hundreds of
 * rows), so no need for anything smarter — this runs once per `findOrCreate`
 * call against the active catalog already loaded for the normalized-name
 * lookup (research.md Decision 2).
 */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** "Close" when the edit distance is small relative to the shorter label. */
function isCloseMatch(a: string, b: string): boolean {
  if (a === b) return false; // handled as an exact match, not a "close" one
  const shorter = Math.min(a.length, b.length);
  const threshold = shorter <= 8 ? 1 : 2;
  return levenshtein(a, b) <= threshold;
}

@Injectable()
export class ThematicTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { search?: string; activeOnly?: boolean }) {
    const activeOnly = params.activeOnly ?? true;
    const search = params.search?.trim().toLowerCase();
    return this.prisma.thematicTag.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(search ? { normalizedName: { contains: search } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    });
  }

  async listAll() {
    const tags = await this.prisma.thematicTag.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { programTags: true, paTags: true } },
      },
    });
    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.isActive,
      createdAt: t.createdAt,
      usageCount: t._count.programTags + t._count.paTags,
    }));
  }

  /**
   * Returns an exact normalized-name match as-is (idempotent, FR-007); on no
   * exact match, either flags a close match for confirmation (FR-007a,
   * `confirmNew` falsy) or creates a brand-new catalog entry.
   */
  async findOrCreate(dto: CreateThematicTagDto, user: JwtPayload) {
    const normalizedName = normalizeTagName(dto.name);
    const exact = await this.prisma.thematicTag.findUnique({
      where: { normalizedName },
    });
    if (exact) return { tag: exact, created: false };

    if (!dto.confirmNew) {
      const active = await this.prisma.thematicTag.findMany({
        where: { isActive: true },
        select: { id: true, name: true, normalizedName: true },
      });
      const closeMatch = active.find((t) =>
        isCloseMatch(t.normalizedName, normalizedName),
      );
      if (closeMatch) {
        throw new ConflictException({
          closeMatch: { id: closeMatch.id, name: closeMatch.name },
        });
      }
    }

    const tag = await this.prisma.thematicTag.create({
      data: {
        name: dto.name.trim(),
        normalizedName,
        createdByUserId: user.sub,
      },
    });
    return { tag, created: true };
  }

  async update(id: string, dto: UpdateThematicTagDto) {
    const data: { name?: string; normalizedName?: string; isActive?: boolean } =
      {};
    if (dto.name !== undefined) {
      const normalizedName = normalizeTagName(dto.name);
      const collision = await this.prisma.thematicTag.findFirst({
        where: { normalizedName, id: { not: id } },
      });
      if (collision) {
        throw new ConflictException(
          `Another tag ("${collision.name}") already normalizes to this name`,
        );
      }
      data.name = dto.name.trim();
      data.normalizedName = normalizedName;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.thematicTag.update({ where: { id }, data });
  }
}
