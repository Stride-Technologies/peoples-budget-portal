import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** A special fund's stated amount for one cycle; `null` clears it. */
export class SetSpecialFundDto {
  @ApiProperty({
    nullable: true,
    example: '272000000.00',
    description:
      'Pesos as a decimal string (never negative). null removes the stated amount.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'statedAmount must be a non-negative decimal string',
  })
  statedAmount!: string | null;

  @ApiPropertyOptional({ description: 'Where the figure comes from.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
