import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query parameters for `GET /aip-registry/exports/complete`.
 *
 * Only the cycle: the export is city-wide by definition, so there is nothing to
 * narrow it by. Entity ids are UUID v7 (`@default(uuid(7))` in the Prisma
 * schema), validated at the HTTP boundary before any database lookup.
 */
export class ExportCompleteQueryDto {
  @ApiProperty({ description: 'AIP cycle id to export', format: 'uuid' })
  @IsUUID('7')
  cycleId!: string;
}
