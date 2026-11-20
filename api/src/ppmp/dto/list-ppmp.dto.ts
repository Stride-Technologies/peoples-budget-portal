import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ListPpmpDto {
  @ApiPropertyOptional({
    description:
      'Filter to one office. Always intersected with the caller’s effective office scope — omitting this does not bypass scoping.',
  })
  @IsOptional()
  @IsString()
  officeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aipCycleId?: string;

  @ApiPropertyOptional({
    description: 'Filter to published (true) or unpublished (false) PPMPs.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isPublished?: boolean;
}
