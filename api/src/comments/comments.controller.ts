import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CommentsService } from './comments.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { ResolveCommentDto } from './dto/resolve-comment.dto.js';
import { CommentStage } from '../generated/prisma/index';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('comments')
@ApiBearerAuth('access-token')
@Controller()
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Post('programs/:programId/comments')
  @RequirePermission('comments:write')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Post a comment on a program (comments:write + the program office in scope)',
  })
  create(
    @Param('programId') programId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(programId, dto, user);
  }

  @Get('programs/:programId/comments')
  @RequirePermission('comments:read')
  @ApiOperation({ summary: 'List comments on a program' })
  @ApiQuery({ name: 'versionId', required: false })
  @ApiQuery({ name: 'stage', required: false, enum: CommentStage })
  @ApiQuery({
    name: 'targetId',
    required: false,
    description:
      'Filter to comments targeting a specific Project/Activity or LineItem id',
  })
  list(
    @Param('programId') programId: string,
    @CurrentUser() user: JwtPayload,
    @Query('versionId') versionId?: string,
    @Query('stage') stage?: CommentStage,
    @Query('targetId') targetId?: string,
  ) {
    return this.service.list(programId, { versionId, stage, targetId }, user);
  }

  @Get('programs/:programId/comments/permission')
  @RequirePermission('comments:read')
  @ApiOperation({
    summary:
      'Whether the caller may post a comment on this program (drives composer visibility)',
  })
  async permission(
    @Param('programId') programId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { canComment: await this.service.canComment(programId, user) };
  }

  @Patch('comments/:id/resolve')
  @RequirePermission('comments:resolve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Resolve a comment thread (proponent office, original commenter, or SUPER_ADMIN). PUBLIC_FEEDBACK threads can be resolved by any reader.',
  })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResolveCommentDto,
  ) {
    return this.service.setResolved(id, true, dto.note, user, dto.reply);
  }

  @Patch('comments/:id/unresolve')
  @RequirePermission('comments:resolve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reopen a resolved comment thread (proponent office, original commenter, or SUPER_ADMIN)',
  })
  unresolve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.setResolved(id, false, undefined, user);
  }

  @Delete('comments/:id')
  @RequirePermission('comments:write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Soft-delete a comment (author or SUPER_ADMIN); restorable',
  })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }

  @Patch('comments/:id/restore')
  @RequirePermission('comments:moderate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restore a soft-deleted comment (SUPER_ADMIN only)',
  })
  restore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.restore(id, user);
  }
}
