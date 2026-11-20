import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSglgIndicatorDto {
  @ApiProperty({
    description: 'DILG pillar name, e.g. "Financial Administration".',
  })
  @IsString()
  @IsNotEmpty()
  pillar: string;

  @ApiProperty({ description: 'Unique indicator code, e.g. FA_01.' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'DILG SGLG edition year.' })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  dilgYear: number;
}

export class UpdateSglgIndicatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pillar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  dilgYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
