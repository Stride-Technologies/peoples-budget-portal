import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Form7Column, OfficeType } from '../../generated/prisma/index';

/**
 * `officeCode` is free text and deliberately not validated against a pattern:
 * the city's coding sheet numbers offices 2-wide ("01") but disambiguates two
 * offices sharing a base code with a parenthetical suffix ("11 (1)"). It is
 * also not unique — see the `Office` model note.
 */
const OFFICE_CODE_DESCRIPTION =
  'AIP code segment 4. Free text, e.g. "01" or "11 (1)" — stored the way the ' +
  'coding sheet writes it; the emitted segment strips the space. Not unique: ' +
  'offices sharing a code and type emit identical AIP reference codes.';

/**
 * The header block of the office's printed AB sheet ("Mandate, Vision/Mission,
 * Major Final Output, Performance Indicators and Targets"). All optional — the
 * city leaves Vision and Mission blank on several sheets — and none of them are
 * code segments, so editing any of them restates nothing.
 */
const PROFILE_FIELDS = {
  mandateLegalBasis:
    'Mandate / Legal Basis, as printed at the head of the AB sheet.',
  vision: "The office's vision statement.",
  mission: "The office's mission statement.",
} as const;

const OUTCOMES_DESCRIPTION =
  'Organizational outcomes, one per printed row. The blank template shows ' +
  '1..n rows; AB 2026 crams them into a single cell, so imported values are ' +
  'split and listed in the import report for review.';

export class CreateOfficeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  acronym: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clusterId: string;

  @ApiPropertyOptional({ description: OFFICE_CODE_DESCRIPTION })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  officeCode?: string;

  @ApiPropertyOptional({
    enum: OfficeType,
    description: 'AIP code segment 3 — maps to the office-type code 01/02/03.',
  })
  @IsOptional()
  @IsEnum(OfficeType)
  officeType?: OfficeType;

  @ApiPropertyOptional({
    description:
      "The office's usual PAP sector, used to pre-select the sector on the " +
      'new-program form. Advisory only — not an AIP code segment, so changing ' +
      'it never restates a reference code.',
  })
  // Nullable on purpose: `null` clears the office's sector. `@IsOptional()`
  // skips validation for null as well as undefined, so it passes straight
  // through to Prisma, which unsets the FK.
  @IsOptional()
  @IsString()
  papSectorId?: string | null;

  @ApiPropertyOptional({
    default: 2,
    description: 'AIP code segment 2. 2 = City.',
  })
  @IsOptional()
  @IsInt()
  lguLevel?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Whether this office endorses programs at HEAD_REVIEWED.',
  })
  @IsOptional()
  @IsBoolean()
  canEndorse?: boolean;

  @ApiPropertyOptional({ description: PROFILE_FIELDS.mandateLegalBasis })
  @IsOptional()
  @IsString()
  mandateLegalBasis?: string | null;

  @ApiPropertyOptional({ description: PROFILE_FIELDS.vision })
  @IsOptional()
  @IsString()
  vision?: string | null;

  @ApiPropertyOptional({ description: PROFILE_FIELDS.mission })
  @IsOptional()
  @IsString()
  mission?: string | null;

  @ApiPropertyOptional({ type: [String], description: OUTCOMES_DESCRIPTION })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationalOutcomes?: string[];

  @ApiPropertyOptional({
    enum: Form7Column,
    nullable: true,
    description:
      'LBP Form 7 column this office prints in. null = unassigned (listed on the Form 7 notes sheet). Independent of officeType, which is an AIP code segment.',
  })
  // `null` unassigns; `@IsOptional()` lets it through to Prisma.
  @IsOptional()
  @IsEnum(Form7Column)
  form7Column?: Form7Column | null;
}

export class UpdateOfficeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  acronym?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  clusterId?: string;

  /** Editing this resyncs every tentative AIP code under the office. */
  @ApiPropertyOptional({ description: OFFICE_CODE_DESCRIPTION })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  officeCode?: string;

  /** Editing this resyncs every tentative AIP code under the office. */
  @ApiPropertyOptional({
    enum: OfficeType,
    description: 'AIP code segment 3 — maps to the office-type code 01/02/03.',
  })
  @IsOptional()
  @IsEnum(OfficeType)
  officeType?: OfficeType;

  @ApiPropertyOptional({
    description:
      "The office's usual PAP sector, used to pre-select the sector on the " +
      'new-program form. Advisory only — not an AIP code segment, so changing ' +
      'it never restates a reference code.',
  })
  // Nullable on purpose: `null` clears the office's sector. `@IsOptional()`
  // skips validation for null as well as undefined, so it passes straight
  // through to Prisma, which unsets the FK.
  @IsOptional()
  @IsString()
  papSectorId?: string | null;

  @ApiPropertyOptional({
    description: 'AIP code segment 2. 2 = City.',
  })
  @IsOptional()
  @IsInt()
  lguLevel?: number;

  @ApiPropertyOptional({
    description: 'Whether this office endorses programs at HEAD_REVIEWED.',
  })
  @IsOptional()
  @IsBoolean()
  canEndorse?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // The AB sheet header block. Not code segments — `updateOffice` writes them
  // without touching `segmentChanged`, so none of them resync a code.
  @ApiPropertyOptional({ description: PROFILE_FIELDS.mandateLegalBasis })
  @IsOptional()
  @IsString()
  mandateLegalBasis?: string | null;

  @ApiPropertyOptional({ description: PROFILE_FIELDS.vision })
  @IsOptional()
  @IsString()
  vision?: string | null;

  @ApiPropertyOptional({ description: PROFILE_FIELDS.mission })
  @IsOptional()
  @IsString()
  mission?: string | null;

  @ApiPropertyOptional({ type: [String], description: OUTCOMES_DESCRIPTION })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationalOutcomes?: string[];

  @ApiPropertyOptional({
    enum: Form7Column,
    nullable: true,
    description:
      'LBP Form 7 column this office prints in. null = unassigned (listed on the Form 7 notes sheet). Independent of officeType, which is an AIP code segment.',
  })
  // `null` unassigns; `@IsOptional()` lets it through to Prisma.
  @IsOptional()
  @IsEnum(Form7Column)
  form7Column?: Form7Column | null;
}
