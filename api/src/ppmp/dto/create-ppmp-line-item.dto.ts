import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ExpenseClass,
  FundSource,
  PPMPProjectType,
  PPMPProcurementMode,
} from '../../generated/prisma/index';

// Same pattern as CreateLineItemDto: no leading '-' is matched, so this also
// rejects negative amounts (FR-012) — no separate non-negative check needed.
const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class CreatePpmpLineItemDto {
  @ApiProperty({
    description:
      '"Name of the Project to be Procured" — first field on the real GPPB form. Named lineItemName, not projectName: "Project" is the parent PPMP itself.',
  })
  @IsString()
  @IsNotEmpty()
  lineItemName: string;

  @ApiPropertyOptional({
    enum: PPMPProjectType,
    description: "Optional — offices don't always have this decided up front.",
  })
  @IsOptional()
  @IsEnum(PPMPProjectType)
  typeOfProject?: PPMPProjectType;

  @ApiPropertyOptional({
    enum: PPMPProcurementMode,
    description: "Optional — offices don't always have this decided up front.",
  })
  @IsOptional()
  @IsEnum(PPMPProcurementMode)
  modeOfProcurement?: PPMPProcurementMode;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uacsObjectId: string;

  @ApiProperty({ example: '1.00' })
  @IsString()
  @Matches(DECIMAL_PATTERN)
  quantity: string;

  @ApiProperty({ example: 'lot' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ example: '500000.00' })
  @IsString()
  @Matches(DECIMAL_PATTERN)
  unitCost: string;

  @ApiProperty({ enum: FundSource })
  @IsEnum(FundSource)
  fundSource: FundSource;

  @ApiProperty({ enum: ExpenseClass })
  @IsEnum(ExpenseClass)
  expenseClass: ExpenseClass;

  @ApiProperty({ description: 'Pre-Procurement Conference, if applicable' })
  @IsBoolean()
  preProcurementConferenceRequired: boolean;

  @ApiProperty({ minimum: 1, maximum: 12, example: 1 })
  @IsInt()
  @Min(1)
  @Max(12)
  procurementStartMonth: number;

  @ApiProperty({ example: 2027 })
  @IsInt()
  procurementStartYear: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  procurementEndMonth: number;

  @ApiProperty({ example: 2027 })
  @IsInt()
  procurementEndYear: number;

  @ApiPropertyOptional({
    description:
      'Free text, one field, e.g. "within 30 days of PO" — not a structured date',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryPeriod?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
