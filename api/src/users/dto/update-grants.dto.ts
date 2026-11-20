import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Replace-set semantics on both dimensions: whatever is sent becomes the complete
 * grant list. An omitted field is left untouched, so the permissions grid and the
 * office picker can be saved together or separately.
 */
export class UpdateGrantsDto {
  @ApiPropertyOptional({
    description:
      'Complete set of permission keys the user should hold. Must all exist in the catalog.',
    example: ['aip:read', 'aip:write'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    description:
      'Grant access to every city office, current and future. When true, officeIds is ignored.',
  })
  @IsOptional()
  @IsBoolean()
  allOfficesScope?: boolean;

  @ApiPropertyOptional({
    description:
      'Complete set of city offices the user may act on. Stored per office, never per cluster.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  officeIds?: string[];
}
