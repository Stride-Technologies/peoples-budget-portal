import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { PpmpService } from './ppmp.service.js';
import { PpmpExportService } from './ppmp-export.service.js';
import { detectDocumentType } from './document-signature.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { CreatePpmpDto } from './dto/create-ppmp.dto.js';
import { UpdatePpmpDto } from './dto/update-ppmp.dto.js';
import { ListPpmpDto } from './dto/list-ppmp.dto.js';
import { CreatePpmpLineItemDto } from './dto/create-ppmp-line-item.dto.js';
import { SetPpmpLineLinkDto } from './dto/set-ppmp-line-link.dto.js';
import { UpdatePpmpLineItemDto } from './dto/update-ppmp-line-item.dto.js';
import { ReorderPpmpLineItemsDto } from './dto/reorder-ppmp-line-items.dto.js';
import { CreatePpmpCommentDto } from './dto/create-ppmp-comment.dto.js';
import { ReplyPpmpFeedbackDto } from './dto/reply-ppmp-feedback.dto.js';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

@ApiTags('ppmp')
@ApiBearerAuth('access-token')
@Controller('ppmp')
export class PpmpController {
  constructor(
    private readonly ppmp: PpmpService,
    private readonly ppmpExport: PpmpExportService,
  ) {}

  @Post()
  @RequirePermission('aip:write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a standalone PPMP with zero line items' })
  create(@Body() dto: CreatePpmpDto, @CurrentUser() user: JwtPayload) {
    return this.ppmp.create(dto, user);
  }

  @Get()
  @RequirePermission('aip:read')
  @ApiOperation({ summary: 'List PPMPs, office-scoped' })
  findAll(@Query() opts: ListPpmpDto, @CurrentUser() user: JwtPayload) {
    return this.ppmp.findAll(opts, user);
  }

  @Get(':id')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Get a PPMP with its ordered line items and grand total',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermission('aip:write')
  @ApiOperation({ summary: 'Rename a PPMP (office/cycle are immutable)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePpmpDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('aip:write')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a PPMP and cascade-delete its line items' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.remove(id, user);
  }

  @Post(':id/line-items')
  @RequirePermission('aip:write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a line item; line total is server-computed' })
  addLineItem(
    @Param('id') id: string,
    @Body() dto: CreatePpmpLineItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.addLineItem(id, dto, user);
  }

  // Declared before ':lineItemId' — Nest matches in order, so the literal
  // 'reorder' segment must win before the wildcard would swallow it (see the
  // same comment on ProgramsController.reorder).
  @Patch(':id/line-items/reorder')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Persist a new manual order for a PPMP’s line items',
  })
  reorderLineItems(
    @Param('id') id: string,
    @Body() dto: ReorderPpmpLineItemsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.reorderLineItems(id, dto, user);
  }

  @Patch(':id/line-items/:lineItemId')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Update a line item; recomputes the line total if amounts change',
  })
  updateLineItem(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: UpdatePpmpLineItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.updateLineItem(id, lineItemId, dto, user);
  }

  @Patch(':id/line-items/:lineItemId/link')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Link a line to the budget row it is bought for (AIP program/PA while Indicative, Ordinance PPA once Final), or clear it',
  })
  setLineLink(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: SetPpmpLineLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.setLineLink(id, lineItemId, dto, user);
  }

  @Get(':id/budget-warnings')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      "Soft warnings: linked budget rows whose PPMP lines (over the year's PPMPs) add up to more than the row's budgeted amount",
  })
  budgetWarnings(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.budgetWarnings(id, user);
  }

  @Get(':id/link-options')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      "The budget rows this PPMP's lines may link to: its office's AIP programs/PAs (Indicative) or enacted Ordinance PPAs (Final)",
  })
  linkOptions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.linkOptions(id, user);
  }

  @Post(':id/create-final')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Make the Final PPMP from an Indicative one, relinking lines to the enacted Ordinance. 409 ORDINANCE_NOT_ENACTED / FINAL_EXISTS',
  })
  createFinal(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.createFinal(id, user);
  }

  @Delete(':id/line-items/:lineItemId')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Delete a line item; returns the recomputed grand total',
  })
  deleteLineItem(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.deleteLineItem(id, lineItemId, user);
  }

  @Post(':id/approve')
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Approve a Project — required before it can be published. Any content edit afterward reverts it to draft.',
  })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.approve(id, user);
  }

  @Post('publish-all')
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Publish every ready (non-empty, unpublished) PPMP in scope; empty ones are skipped, not failed',
  })
  publishAll(@Query() opts: ListPpmpDto, @CurrentUser() user: JwtPayload) {
    return this.ppmp.publishAll(opts, user);
  }

  @Post(':id/publish')
  @RequirePermission('aip:publish')
  @ApiOperation({ summary: 'Publish a PPMP to the public page' })
  publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.publish(id, user);
  }

  @Post(':id/unpublish')
  @RequirePermission('aip:publish')
  @ApiOperation({ summary: 'Unpublish a PPMP, hiding it from the public page' })
  unpublish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.unpublish(id, user);
  }

  @Post(':id/line-items/:lineItemId/document')
  @RequirePermission('aip:write')
  // Multer stops reading at the limit (413) instead of buffering the whole body first.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Attach (or replace) a line item’s supporting document; PDF/Word/Excel/JPG/PNG, max 10MB',
  })
  async attachDocument(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    // The type is read from the bytes, not the client's Content-Type header.
    const mimetype = detectDocumentType(file.buffer, file.originalname);
    if (!mimetype) {
      throw new BadRequestException(
        'Unsupported file — attach a PDF, Word, Excel, JPG or PNG file',
      );
    }
    return this.ppmp.attachDocument(
      id,
      lineItemId,
      {
        buffer: file.buffer,
        mimetype,
        originalname: file.originalname,
      },
      user,
    );
  }

  @Get(':id/comments')
  @RequirePermission('aip:read')
  @ApiOperation({ summary: 'List a Project’s comments, nested one level' })
  listComments(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.listComments(id, user);
  }

  @Post(':id/comments')
  @RequirePermission('aip:write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Post a comment or reply on a Project' })
  addComment(
    @Param('id') id: string,
    @Body() dto: CreatePpmpCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.addComment(id, dto, user);
  }

  // Residents' feedback is moderation data: the same keys as /lgu/feedback.
  @Get(':id/feedback')
  @RequirePermission('public_comments:view')
  @ApiOperation({ summary: 'List a Project’s public feedback submissions' })
  listFeedback(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.listFeedback(id, user);
  }

  @Post(':id/feedback/:feedbackId/reply')
  @RequirePermission('public_comments:reply')
  @ApiOperation({ summary: 'Post an official reply to a feedback submission' })
  replyToFeedback(
    @Param('id') id: string,
    @Param('feedbackId') feedbackId: string,
    @Body() dto: ReplyPpmpFeedbackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ppmp.replyToFeedback(id, feedbackId, dto, user);
  }

  @Get(':id/history')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'Synthesized activity feed — creation, line item changes, publish/unpublish',
  })
  getHistory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ppmp.getHistory(id, user);
  }

  @Get('exports/all')
  @RequirePermission('aip:export')
  @ApiOperation({
    summary: 'Export PPMPs in scope as an Excel workbook, one sheet per office',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportAll(
    @Query() opts: ListPpmpDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workbook = await this.ppmpExport.exportAll(opts, user);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${workbook.fileName}"`,
    );
    response.setHeader('Content-Length', workbook.buffer.length);
    return new StreamableFile(workbook.buffer);
  }
}
