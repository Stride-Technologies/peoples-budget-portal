import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { FundSource } from '../../generated/prisma/index';
import type { LbpFigures } from '../lbp-figures.js';

/** LBP Forms 4 and 7 (specs/008 contracts/exports.md). */
export class ExportLbpQueryDto {
  @ApiProperty({ description: 'The AIP cycle (fiscal year) to export.' })
  @IsString()
  @IsNotEmpty()
  cycleId!: string;

  @ApiPropertyOptional({
    enum: FundSource,
    default: FundSource.GF,
    description: 'One form per fund. Defaults to the General Fund.',
  })
  @IsOptional()
  @IsEnum(FundSource)
  fund: FundSource = FundSource.GF;

  @ApiProperty({
    enum: ['working', 'published', 'document'],
    description:
      'working: live programs, drafts included, marked DRAFT. published: last published figures only. document: a submitted LEP or enacted Ordinance of this year (documentId). No default, so the choice is always explicit.',
  })
  @IsIn(['working', 'published', 'document'])
  figures!: LbpFigures;

  @ApiPropertyOptional({
    description: "With figures=document: the LEP's or Ordinance's id.",
  })
  @ValidateIf((q: ExportLbpQueryDto) => q.figures === 'document')
  @IsString()
  @IsNotEmpty()
  documentId?: string;
}

export class ExportLbpForm4QueryDto extends ExportLbpQueryDto {
  @ApiPropertyOptional({
    description:
      "One office's sheet. Omit for every office the caller's scope reaches.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  officeId?: string;
}
