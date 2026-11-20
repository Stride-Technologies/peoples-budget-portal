import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { FundSource } from '../../generated/prisma/index';

const DECIMAL = /^\d+(\.\d{1,2})?$/;

/** One line of a row's per-fund split: what one fund pays, by expense class. */
export class FundAllocationDto {
  @ApiProperty({ enum: FundSource })
  @IsEnum(FundSource)
  fundSource!: FundSource;

  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(DECIMAL, { message: 'ps must be a valid decimal string' })
  ps!: string;

  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(DECIMAL, { message: 'mooe must be a valid decimal string' })
  mooe!: string;

  /** Financial Expenses. Optional so a client that predates FE still sends a valid line. */
  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: 'fe must be a valid decimal string' })
  fe?: string;

  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(DECIMAL, { message: 'co must be a valid decimal string' })
  co!: string;
}
