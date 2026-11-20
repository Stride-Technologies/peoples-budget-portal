import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ExpenseClass } from '../../generated/prisma/index';

export class CreateUacsObjectDto {
  @ApiProperty({ description: 'UACS object code (may have leading zeros).' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: ExpenseClass })
  @IsEnum(ExpenseClass)
  expenseClass: ExpenseClass;
}

export class UpdateUacsObjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiPropertyOptional({ enum: ExpenseClass })
  @IsOptional()
  @IsEnum(ExpenseClass)
  expenseClass?: ExpenseClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
