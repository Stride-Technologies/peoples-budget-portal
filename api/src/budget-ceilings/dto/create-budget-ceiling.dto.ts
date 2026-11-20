import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Decimal-as-string per Prisma convention; validated as numeric string here so we
 * can preserve precision through JSON without floating-point drift.
 */
const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class CreateBudgetCeilingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  aipCycleId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  finishLineId: string;

  @ApiProperty({
    example: '50000000.00',
    description:
      'Total ceiling in pesos (Decimal 18,2). String to preserve precision. ' +
      '"0.00" is valid and means a real cap of zero — nothing may be proposed ' +
      'against this finish line — not "no ceiling set".',
  })
  @IsString()
  @Matches(DECIMAL_PATTERN, {
    message:
      'totalCeiling must be a non-negative decimal with up to 2 fraction digits',
  })
  totalCeiling: string;
}
