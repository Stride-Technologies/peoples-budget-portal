import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePublicComparisonDto {
  @ApiProperty({
    description:
      'Whether the public Overview may compare this cycle against the previous enacted year.',
  })
  @IsBoolean()
  enabled: boolean;
}
