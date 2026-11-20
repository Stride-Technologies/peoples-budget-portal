import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseClass } from '../../generated/prisma/index';

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class CreateLineItemDto {
  @ApiProperty({ enum: ExpenseClass })
  @IsEnum(ExpenseClass)
  expenseClass: ExpenseClass;

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
