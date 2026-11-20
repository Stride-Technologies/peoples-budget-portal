import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
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

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class UpdatePpmpLineItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lineItemName?: string;

  @ApiPropertyOptional({ enum: PPMPProjectType })
  @IsOptional()
  @IsEnum(PPMPProjectType)
  typeOfProject?: PPMPProjectType;

  @ApiPropertyOptional({ enum: PPMPProcurementMode })
  @IsOptional()
  @IsEnum(PPMPProcurementMode)
  modeOfProcurement?: PPMPProcurementMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uacsObjectId?: string;

  @ApiPropertyOptional({ example: '1.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  quantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '500000.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  unitCost?: string;

  @ApiPropertyOptional({ enum: FundSource })
  @IsOptional()
  @IsEnum(FundSource)
  fundSource?: FundSource;

  @ApiPropertyOptional({ enum: ExpenseClass })
  @IsOptional()
  @IsEnum(ExpenseClass)
  expenseClass?: ExpenseClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  preProcurementConferenceRequired?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  procurementStartMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  procurementStartYear?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  procurementEndMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  procurementEndYear?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryPeriod?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
