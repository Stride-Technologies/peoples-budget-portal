import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdateFinishLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  visionNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Short-form display name, e.g. "Green City".',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  shortName?: string;

  @ApiPropertyOptional({
    description: 'Hex colour used by the public view, e.g. "#4C9F38".',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex value like #4C9F38',
  })
  color?: string;
}
