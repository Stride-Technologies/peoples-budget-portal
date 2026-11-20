import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateOpenDataDto {
  @ApiProperty({
    description:
      "Whether this cycle's published budget is downloadable and served by the open-data API.",
  })
  @IsBoolean()
  enabled: boolean;
}
