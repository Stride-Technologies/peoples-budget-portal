import { Type } from 'class-transformer';
import { FundAllocationDto } from '../../budget-rollup/dto/fund-allocation.dto.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FundSource, PPACostMode, PPAType } from '../../generated/prisma/index';

export class UpdateProjectActivityDto {
  @ApiPropertyOptional({ enum: PPAType })
  @IsOptional()
  @IsEnum(PPAType)
  type?: PPAType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  remarks?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expectedOutput?: string | null;

  @ApiPropertyOptional({
    description: 'Proposed budget amount as decimal string, e.g. "200000.00"',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'proposedBudget must be a valid decimal string',
  })
  proposedBudget?: string | null;

  @ApiPropertyOptional({
    enum: FundSource,
    isArray: true,
    description: 'Replaces the fund source set. At least one when sent.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(FundSource, { each: true })
  fundSources?: FundSource[];

  @ApiPropertyOptional({
    description:
      'Personnel Services estimate as a decimal string. Send null to clear. Phase 1 cost estimate (D3).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'psEstimate must be a valid decimal string',
  })
  psEstimate?: string | null;

  @ApiPropertyOptional({
    description:
      'Maintenance & Other Operating Expenses estimate as a decimal string. Send null to clear.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'mooeEstimate must be a valid decimal string',
  })
  mooeEstimate?: string | null;

  @ApiPropertyOptional({
    description:
      'Financial Expenses estimate as a decimal string. Send null to clear.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'feEstimate must be a valid decimal string',
  })
  feEstimate?: string | null;

  @ApiPropertyOptional({
    description:
      'Capital Outlay estimate as a decimal string. Send null to clear.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'coEstimate must be a valid decimal string',
  })
  coEstimate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ enum: PPACostMode })
  @IsOptional()
  @IsEnum(PPACostMode)
  costMode?: PPACostMode;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  implementationStartMonth?: number | null;

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  implementationStartYear?: number | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  implementationEndMonth?: number | null;

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  implementationEndYear?: number | null;

  @ApiPropertyOptional({
    type: [FundAllocationDto],
    description:
      'Split the money by fund source: one line per fund with its own PS/MOOE/CO. When sent, the lines replace the PS/MOOE/CO and fund sources (both are derived from them); [] returns the row to one total. Only for a row that states its own costs.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => FundAllocationDto)
  fundAllocations?: FundAllocationDto[];
}
