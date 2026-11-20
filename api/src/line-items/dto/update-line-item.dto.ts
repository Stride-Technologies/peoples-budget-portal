import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseClass } from '../../generated/prisma/index';

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class UpdateLineItemDto {
  @ApiPropertyOptional({ enum: ExpenseClass })
  @IsOptional()
  @IsEnum(ExpenseClass)
  expenseClass?: ExpenseClass;

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
