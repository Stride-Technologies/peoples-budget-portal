import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { PapClass } from '../../generated/prisma/index';

// Programs are LGU-only: a preview is for a city office's next code.
export class PreviewAIPCodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  aipCycleId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  papSectorId: string;

  @ApiProperty({ description: 'Implementing city office (required).' })
  @IsString()
  @IsNotEmpty()
  officeId: string;

  @ApiPropertyOptional({
    enum: PapClass,
    description:
      'AIP form section. The ordinal ranks by section first, so omitting this ' +
      'previews the code of a program that sorts last in the scope.',
  })
  @IsOptional()
  @IsEnum(PapClass)
  papClass?: PapClass;
}
