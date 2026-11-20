import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Query parameters for `GET /aip-registry/exports/cluster`.
 *
 * Entity ids in this system are UUID v7 (`@default(uuid(7))` in the Prisma
 * schema), so both ids are validated as UUIDs. This rejects malformed,
 * oversized, or injection-style inputs at the HTTP boundary, before any
 * database lookup — the global ValidationPipe (`whitelist`, `transform`) strips
 * unknown query keys as well.
 */
export class ExportClusterQueryDto {
  @ApiProperty({ description: 'AIP cycle id to export', format: 'uuid' })
  @IsUUID('7')
  cycleId!: string;

  @ApiPropertyOptional({
    description:
      'Cluster id to export. Optional — office/CSO users default to their own ' +
      'cluster; only multi-cluster roles may target another cluster.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('7')
  clusterId?: string;
}
