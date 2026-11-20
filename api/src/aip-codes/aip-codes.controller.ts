import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AIPCodesService } from './aip-codes.service.js';
import { PreviewAIPCodeDto } from './dto/preview-aip-code.dto.js';
import { PreviewPAAIPCodeDto } from './dto/preview-pa-aip-code.dto.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@ApiTags('aip-codes')
@ApiBearerAuth('access-token')
@Controller('aip-codes')
export class AIPCodesController {
  constructor(private readonly service: AIPCodesService) {}

  @Post('preview')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Preview the tentative AIP code a new program in this scope would get',
  })
  preview(@Body() dto: PreviewAIPCodeDto) {
    return this.service.previewProgramCode(dto);
  }

  @Post('preview-pa')
  @RequirePermission('aip:write')
  @ApiOperation({
    summary:
      'Preview the tentative AIP code the next project/activity would get',
  })
  previewPA(@Body() dto: PreviewPAAIPCodeDto) {
    return this.service.previewPACode(dto);
  }
}
