import { Type } from 'class-transformer';
import { FundAllocationDto } from '../../budget-rollup/dto/fund-allocation.dto.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// Programs are LGU-only since the NCPC proponent track was retired (endorser
// pivot). The proponent is the implementing city office.
export class CreateProgramDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  aipCycleId: string;

  @ApiProperty({ description: 'Implementing city office (required).' })
  @IsString()
  @IsNotEmpty()
  officeId: string;

  @ApiPropertyOptional({
    description:
      "The office whose printed AB sheet this program appears under, in that sheet's " +
      'COMPONENT PROGRAMS band — City Health Office II under CHO, OSCA under CSWDO. ' +
      'Omit for the ordinary case. May equal `officeId`: an office can list a ' +
      "program in its own sheet's component band (the city's `004` bucket). " +
      'Not an AIP-code segment: the code always names `officeId`.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  hostOfficeId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  papSectorId: string;

  @ApiPropertyOptional({ example: '000', default: '000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{3}$/)
  papSubsectorCode?: string;

  @ApiProperty({
    enum: PapClass,
    description:
      'Which AIP form section this program prints under (GAS / STO / Operations).',
  })
  @IsEnum(PapClass)
  papClass: PapClass;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  finishLineId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subFinishLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sglgIndicatorId?: string;

  @ApiProperty({ minLength: 5, maxLength: 255 })
  @IsString()
  @Length(5, 255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Justification / notes for reviewers',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description:
      'Major Final Output (MFO) statement. Optional — often not settled when the program is first drafted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expectedOutput?: string;

  /** The printed sheet's Target for the Budget Year column (LBP Form 4). */
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetForBudgetYear?: string;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  implementationStartMonth: number;

  @ApiProperty({ minimum: 2000, maximum: 2100 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  implementationStartYear: number;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  implementationEndMonth: number;

  @ApiProperty({ minimum: 2000, maximum: 2100 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  implementationEndYear: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description:
      'Supporting city office IDs — max 4, excluding the implementing office.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  supportingOfficeIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'SDG goal IDs this program is tagged against.',
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
