import { Type } from 'class-transformer';
import { FundAllocationDto } from '../../budget-rollup/dto/fund-allocation.dto.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
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

export class CreateProjectActivityDto {
  @ApiProperty({ enum: PPAType })
  @IsEnum(PPAType)
  type: PPAType;

  @ApiProperty({ minLength: 5, maxLength: 255 })
  @IsString()
  @Length(5, 255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expectedOutput?: string;

  @ApiPropertyOptional({
    description: 'Proposed budget amount as decimal string, e.g. "200000.00"',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'proposedBudget must be a valid decimal string',
  })
  proposedBudget?: string;

  @ApiProperty({
    enum: FundSource,
    isArray: true,
    description:
      'Funds this PPA draws on. At least one; no amount is split per fund. ' +
      'Send `[]` when costMode is ACTIVITY_CHILDREN — such a parent draws on ' +
      'whatever its child activities do, and the server unions them.',
  })
  // No ArrayMinSize here: "at least one" depends on costMode, and a ValidateIf
  // would switch off the enum and uniqueness checks along with it. The service
  // enforces the non-empty rule where costMode is unambiguous.
  @IsArray()
  @ArrayUnique()
  @IsEnum(FundSource, { each: true })
  fundSources: FundSource[];

  @ApiPropertyOptional({
    description:
      'Personnel Services estimate as a decimal string, e.g. "200000.00". Phase 1 cost estimate (D3); proposedBudget is computed from the three.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'psEstimate must be a valid decimal string',
  })
  psEstimate?: string;

  @ApiPropertyOptional({
    description:
      'Maintenance & Other Operating Expenses estimate as a decimal string.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'mooeEstimate must be a valid decimal string',
  })
  mooeEstimate?: string;

  @ApiPropertyOptional({
    description: 'Financial Expenses estimate as a decimal string.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'feEstimate must be a valid decimal string',
  })
  feEstimate?: string;

  @ApiPropertyOptional({
    description: 'Capital Outlay estimate as a decimal string.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'coEstimate must be a valid decimal string',
  })
  coEstimate?: string;

  @ApiPropertyOptional({ description: 'For future Project→Activity nesting' })
  @IsOptional()
  @IsString()
  parentProjectActivityId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({
    enum: PPACostMode,
    default: PPACostMode.DIRECT_COSTS,
    description:
      'Used for PROJECT entries; ignored for ACTIVITY entries in this phase.',
  })
  @IsOptional()
  @IsEnum(PPACostMode)
  costMode?: PPACostMode;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  implementationStartMonth?: number;

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  implementationStartYear?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  implementationEndMonth?: number;

  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  implementationEndYear?: number;

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
