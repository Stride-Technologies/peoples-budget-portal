import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class PreviewPAAIPCodeDto {
  @ApiProperty({ description: 'Program the project/activity hangs off.' })
  @IsString()
  @IsNotEmpty()
  programId: string;

  @ApiPropertyOptional({
    description:
      'Parent project/activity, when adding an activity under a project that ' +
      'derives its cost from its activities. Omit for a root project/activity.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentProjectActivityId?: string;
}
