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
import { ProgramsService } from './programs.service.js';
import { ProgramPublishService } from './program-publish.service.js';
import { ProgramWorkflowService } from './program-workflow.service.js';
import { ProgramVersionsService } from './program-versions.service.js';
import { ProgramDiffService } from '../program-audit/program-diff.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { CreateProgramDto } from './dto/create-program.dto.js';
import { UpdateProgramDto } from './dto/update-program.dto.js';
import { ReorderProgramsDto } from './dto/reorder-programs.dto.js';
import { ListProgramsDto } from './dto/list-programs.dto.js';
import { ArchiveProgramDto } from './dto/archive-program.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('programs')
@ApiBearerAuth('access-token')
@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly workflow: ProgramWorkflowService,
    private readonly versions: ProgramVersionsService,
    private readonly publish: ProgramPublishService,
    private readonly diff: ProgramDiffService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermission('aip:write')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a draft program; assigns a tentative AIP code',
  })
  create(@Body() dto: CreateProgramDto, @CurrentUser() user: JwtPayload) {
    return this.programs.create(dto, user);
  }

  @Get()
  @RequirePermission('aip:read')
  @ApiOperation({ summary: 'List programs with visibility & filters' })
  findAll(@Query() opts: ListProgramsDto, @CurrentUser() user: JwtPayload) {
    return this.programs.findAll(opts, user);
  }

  @Get(':id')
  @RequirePermission('aip:read')
  @ApiOperation({ summary: 'Get one program with children + budget rollups' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.programs.findOne(id, user);
  }

  // Declared before ':id' — Nest matches in order, so a literal segment placed
  // after the param route would never be reached.
  @Patch('reorder')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Reorder programs within one code scope (cycle + office + PAP sector), renumbering their AIP codes',
  })
  reorder(@Body() dto: ReorderProgramsDto, @CurrentUser() user: JwtPayload) {
    return this.programs.reorder(dto, user);
  }

  @Patch(':id')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary: 'Update a program while it is editable (DRAFT or FOR_REVISION)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.programs.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('aip:delete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Soft-delete an editable program (DRAFT/FOR_REVISION; SUPER_ADMIN may override)',
  })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.programs.softDelete(id, user);
  }

  // ─── Workflow transitions ─────────────────────────────────────────────────

  @Get(':id/approvals')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Per-LFC-member-office approval status for the current version',
  })
  approvals(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.workflow.listApprovals(id, user);
  }

  // ─── Versions ─────────────────────────────────────────────────────────────

  @Get(':id/draft-diff')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'Field-level diff of the working copy against the published snapshot — drives the compare view and the changed-row highlighting.',
  })
  async draftDiff(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.programs.assertCanRead(id, user);
    return this.diff.diffAgainstPublished(id);
  }

  @Get(':id/versions')
  @RequirePermission('aip:read')
  @ApiOperation({ summary: 'List submission snapshots for this program' })
  listVersions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.programs
      .assertCanRead(id, user)
      .then(() => this.versions.listVersions(id));
  }

  @Get(':id/versions/compare')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'Side-by-side compare: ?from=N&to=M|current. Returns both payloads.',
  })
  @ApiQuery({ name: 'from', required: true, type: Number })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Version number, or the literal "current"',
  })
  compareVersions(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.programs
      .assertCanRead(id, user)
      .then(() =>
        this.versions.compare(
          id,
          Number(from),
          to === 'current' ? 'current' : Number(to),
        ),
      );
  }

  // ─── Activity stream ──────────────────────────────────────────────────────

  @Get(':id/activity-stream')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Chronological union of comments, endorsements, and verdicts',
  })
  activityStream(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.programs
      .assertCanRead(id, user)
      .then(() => this.workflow.activityStream(id));
  }

  // ─── Endorsement status + read state ──────────────────────────────────────

  @Get(':id/endorsements')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary: 'Per-endorser-office endorsement status for the current version',
  })
  endorsements(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.programs.listEndorsements(id, user);
  }

  @Post(':id/revise')
  @HttpCode(200)
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'PUBLISHED → PUBLISHED_REVISION. Opens an unpublished draft on a published AIP; the public keeps seeing the last published version until someone republishes.',
  })
  revise(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.publish.openRevision(id, user);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Publish or republish. Writes a ProgramVersion snapshot, advances publishedVersionId, and assigns the final AIP reference code on first publish.',
  })
  publishProgram(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.publish.publish(id, user);
  }

  @Post(':id/discard-draft')
  @HttpCode(200)
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Discard unpublished changes and restore live rows from the published snapshot. Needs only aip:write — it moves toward the published state, never away from it.',
  })
  discardDraft(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.publish.discardDraft(id, user);
  }

  // SUPER_ADMIN only — enforced in the service; the permission only gates the
  // route the way publish does (SUPER_ADMIN bypasses every grant).
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Archive a PUBLISHED program (SUPER_ADMIN, reason required): it keeps its history and public link but leaves every list, total and export (specs/013).',
  })
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveProgramDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.publish.archive(id, dto.reason, user);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      'Return an ARCHIVED program to DRAFT (SUPER_ADMIN, reason required); it must pass the readiness gate to be published again.',
  })
  unarchive(
    @Param('id') id: string,
    @Body() dto: ArchiveProgramDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.publish.unarchive(id, dto.reason, user);
  }

  @Post(':id/acknowledge-import')
  @HttpCode(200)
  @RequirePermission('aip:publish')
  @ApiOperation({
    summary:
      "Confirm the 2027 import's decisions on this program (an inferred finish line, a duplicate merge, a synthesised heading), clearing importWarnings and the INCOMPLETE_IMPORT blocker. Data gaps are not cleared here — those are derived and clear themselves when the data is fixed.",
  })
  acknowledgeImport(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.publish.acknowledgeImport(id, user);
  }

  @Get(':id/publish-readiness')
  @RequirePermission('aip:read')
  @ApiOperation({
    summary:
      'Publish preconditions for one program, plus advisory ceiling warnings and the unresolved-comment count (which never blocks).',
  })
  async publishReadiness(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.programs.assertCanRead(id, user);
    return this.publish.readinessFor(id);
  }

  @Post(':id/mark-seen')
  @RequirePermission('aip:read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark the program as seen by the current user (clears unread dot)',
  })
  markSeen(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.programs.markSeen(id, user);
  }

  @Post(':id/thematic-tags')
  @HttpCode(200)
  @RequirePermission('aip:tag')
  @ApiOperation({
    summary:
      'Apply a thematic tag directly to this program (idempotent). Only while the program is editable.',
  })
  applyThematicTag(
    @Param('id') id: string,
    @Body('tagId') tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.programs.applyThematicTag(id, tagId, user);
  }

  @Delete(':id/thematic-tags/:tagId')
  @HttpCode(200)
  @RequirePermission('aip:tag')
  @ApiOperation({
    summary:
      'Remove a thematic tag directly applied to this program (idempotent). Only while the program is editable.',
  })
  removeThematicTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.programs.removeThematicTag(id, tagId, user);
  }
}
