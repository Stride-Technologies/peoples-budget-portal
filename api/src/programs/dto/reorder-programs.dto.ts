import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderProgramsDto {
  @ApiProperty({
    type: [String],
    description:
      'Every program id in one code scope (cycle + implementing office + PAP sector), in the desired order. Programs from more than one scope are rejected — the ordinal only means anything within a scope.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
