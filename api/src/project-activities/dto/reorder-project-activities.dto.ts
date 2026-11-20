import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class ReorderProjectActivitiesDto {
  @ApiPropertyOptional({
    description:
      'Parent whose children are being reordered. Omit (or null) to reorder the program’s root-level Projects/Activities.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  parentProjectActivityId?: string | null;

  @ApiProperty({
    type: [String],
    description:
      'Every sibling id under that parent, in the desired order. Must be complete — a partial list would leave the rest ranked arbitrarily.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
