import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/index';
import { LguService } from './lgu.service.js';
import {
  LguAnalyticsQueryDto,
  LguFeedbackQueryDto,
} from './dto/lgu-feedback-query.dto.js';
import { FeedbackReplyDto } from './dto/feedback-reply.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('lgu')
@ApiBearerAuth('access-token')
@Roles(Role.HEAD, Role.STAFF)
@Controller('lgu')
export class LguController {
  constructor(private readonly service: LguService) {}

  @Get('feedback')
  @RequirePermission('public_comments:view')
  @ApiOperation({
    summary:
      "List PUBLIC_FEEDBACK comments for the caller's LGU city office programs",
  })
  @ApiQuery({ name: 'cycleId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'pending', 'reviewed'],
  })
  listFeedback(
    @Query() dto: LguFeedbackQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listFeedback(user, dto);
  }

  @Patch('feedback/:id/review')
  @RequirePermission('public_comments:moderate')
  @ApiOperation({ summary: 'Mark a feedback item as reviewed' })
  @ApiBody({ schema: { properties: { note: { type: 'string' } } } })
  reviewFeedback(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reviewFeedback(user, id, body.note);
  }

  @Patch('feedback/:id/unreview')
  @RequirePermission('public_comments:moderate')
  @ApiOperation({ summary: 'Undo review on a feedback item' })
  unreviewFeedback(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.unreviewFeedback(user, id);
  }

  @Post('feedback/:id/reply')
  @RequirePermission('public_comments:reply')
  @ApiOperation({
    summary: 'Post or update an official public reply to a feedback item',
  })
  setReply(
    @Param('id') id: string,
    @Body() body: FeedbackReplyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setReply(user, id, body.content);
  }

  @Delete('feedback/:id/reply')
  @RequirePermission('public_comments:reply')
  @ApiOperation({
    summary: 'Delete the official public reply on a feedback item',
  })
  deleteReply(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.deleteReply(user, id);
  }

  @Get('feedback/analytics')
  @RequirePermission('public_comments:view')
  @ApiOperation({
    summary:
      "Aggregate feedback analytics for the caller's LGU city office programs",
  })
  @ApiQuery({ name: 'cycleId', required: false })
  getAnalytics(
    @Query() dto: LguAnalyticsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getAnalytics(user, dto);
  }
}
