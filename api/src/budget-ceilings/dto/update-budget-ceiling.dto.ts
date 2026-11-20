import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class UpdateBudgetCeilingDto {
  @ApiPropertyOptional({ example: '50000000.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  totalCeiling?: string;
}
