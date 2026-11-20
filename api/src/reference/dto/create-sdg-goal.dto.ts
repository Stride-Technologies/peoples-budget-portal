import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSdgGoalDto {
  @ApiProperty({
    description:
      'Unique goal code, zero-padded so `code asc` sorts numerically, e.g. SDG-01.',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Goal title, e.g. "No Poverty".' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateSdgGoalDto {
  // `code` is deliberately absent: codes are immutable once created, same as
  // every other reference table.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
