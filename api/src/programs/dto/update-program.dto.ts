import { Type } from 'class-transformer';
import { FundAllocationDto } from '../../budget-rollup/dto/fund-allocation.dto.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FundSource,
  PPACostMode,
  PapClass,
} from '../../generated/prisma/index';

export class UpdateProgramDto {
  @ApiPropertyOptional({
    description:
      'Reassigns the implementing office. Re-issues the tentative AIP reference code, since the office supplies two of its segments.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  officeId?: string;

  @ApiPropertyOptional({
    description:
      "The office whose printed AB sheet this program appears under, in that sheet's " +
      'COMPONENT PROGRAMS band. Send `null` to make it an ordinary program again. ' +
      'Not an AIP-code segment, so changing it restates nothing.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  hostOfficeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  papSectorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{3}$/)
  papSubsectorCode?: string;

  @ApiPropertyOptional({ enum: PapClass })
  @IsOptional()
  @IsEnum(PapClass)
  papClass?: PapClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finishLineId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  subFinishLineId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sglgIndicatorId?: string | null;

  @ApiPropertyOptional({ minLength: 5, maxLength: 255 })
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
  @MaxLength(1000)
  remarks?: string | null;

  // Nullable and empty-string-tolerant: clearing the field is a legitimate edit
  // now that it is optional, and `@Length(10, …)` rejected both.
  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expectedOutput?: string | null;

  /** The printed sheet's Target for the Budget Year column (LBP Form 4). */
  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetForBudgetYear?: string | null;

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
    type: [String],
    maxItems: 5,
    description:
      'Replaces the current supporting offices set. LGU: max 4 (excluding implementing office). NCPC: 1–5 required.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  supportingOfficeIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Replaces the current SDG goal set.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sdgGoalIds?: string[];

  @ApiPropertyOptional({
    enum: PPACostMode,
    description:
      'Whether the program states its own costs (DIRECT_COSTS) or derives them from its project/activities (ACTIVITY_CHILDREN, the default). A program cannot do both.',
  })
  @IsOptional()
  @IsEnum(PPACostMode)
  costMode?: PPACostMode;

  @ApiPropertyOptional({
    enum: FundSource,
    isArray: true,
    description:
      'Funding sources for a program that states its own costs. Ignored when the program derives its costs from its PPAs.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(FundSource, { each: true })
  fundSources?: FundSource[];

  @ApiPropertyOptional({
    description:
      'Personnel Services figure as a decimal string, for a program that states its own costs. Send null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'psProposedTotal must be a valid decimal string',
  })
  psProposedTotal?: string | null;

  @ApiPropertyOptional({
    description:
      'MOOE figure as a decimal string, for a program that states its own costs. Send null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'mooeProposedTotal must be a valid decimal string',
  })
  mooeProposedTotal?: string | null;

  @ApiPropertyOptional({
    description:
      'Financial Expenses figure as a decimal string, for a program that states its own costs. Send null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'feProposedTotal must be a valid decimal string',
  })
  feProposedTotal?: string | null;

  @ApiPropertyOptional({
    description:
      'Capital Outlay figure as a decimal string, for a program that states its own costs. Send null to clear.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'coProposedTotal must be a valid decimal string',
  })
  coProposedTotal?: string | null;

  @ApiPropertyOptional({
    type: [FundAllocationDto],
    description:
      'Split the money by fund source: one line per fund with its own PS/MOOE/FE/CO. When sent, the lines replace the PS/MOOE/FE/CO and fund sources (both are derived from them); [] returns the row to one total. Only for a row that states its own costs.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => FundAllocationDto)
  fundAllocations?: FundAllocationDto[];
}
