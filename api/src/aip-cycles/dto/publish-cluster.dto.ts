import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

/**
 * Cluster is the only batch scope (D23). "Publish the whole cycle" is one click
 * away from publishing 248 AIPs by accident, and CPDO works cluster by cluster.
 */
export class PublishClusterDto {
  @ApiProperty({
    description: 'Clusters whose offices\u2019 programs should be published.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  clusterIds!: string[];
}
