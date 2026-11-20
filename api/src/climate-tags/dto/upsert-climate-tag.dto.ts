import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

export class UpsertClimateTagDto {
  /**
   * 0..n `ClimateTypologyCode.id`s. Empty is allowed — the city's AIP carries
   * climate amounts not yet coded — but a tag with an amount and no code
   * blocks publishing until one is added.
   */
  @ApiProperty({ type: [String], description: 'ClimateTypologyCode ids' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  ccetCodeIds: string[];

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  ccaAmount?: string;

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  ccmAmount?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
