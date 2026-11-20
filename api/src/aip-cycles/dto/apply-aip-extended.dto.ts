import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One AIP-Extended sheet row and the AIP entry a staff member matched it to. */
export class AipExtendedRowDto {
  @ApiProperty({ description: 'The program the row fills.' })
  @IsString()
  @IsNotEmpty()
  programId!: string;

  @ApiProperty({ description: 'Sheet row number, for the edit history.' })
  @IsInt()
  sheetRow!: number;

  @ApiProperty({ description: 'The code as the sheet wrote it.' })
  @IsString()
  @MaxLength(100)
  aipCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  indicator!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  target!: string;

  @ApiProperty({ type: [String], example: ['SDG-05', 'SDG-16'] })
  @IsArray()
  @ArrayMaxSize(17)
  @IsString({ each: true })
  sdgCodes!: string[];
}

export class ApplyAipExtendedDto {
  @ApiPropertyOptional({
    description: 'The uploaded workbook, for the edit history.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiProperty({ type: [AipExtendedRowDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => AipExtendedRowDto)
  rows!: AipExtendedRowDto[];
}
