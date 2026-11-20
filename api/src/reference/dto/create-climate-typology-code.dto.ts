import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ClimatePillar } from '../../generated/prisma/index';

export class CreateClimateTypologyCodeDto {
  @ApiProperty({ description: 'CCET code, e.g. CCA_001.' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ enum: ClimatePillar })
  @IsEnum(ClimatePillar)
  pillar: ClimatePillar;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateClimateTypologyCodeDto {
  @ApiPropertyOptional({ enum: ClimatePillar })
  @IsOptional()
  @IsEnum(ClimatePillar)
  pillar?: ClimatePillar;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
