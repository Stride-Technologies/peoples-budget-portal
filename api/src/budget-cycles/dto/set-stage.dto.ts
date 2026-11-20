import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, Max, Min } from 'class-validator';

export class SetStageDto {
  @ApiProperty({
    minimum: 0,
    maximum: 9,
    description:
      'Where the cycle stands, 0–9 (0 Consultations … 8 Execution, 9 Accountability).',
  })
  @IsInt()
  @Min(0)
  @Max(9)
  currentStage: number;

  @ApiProperty({
    type: [Number],
    description: 'Stages running alongside the current one (cycles overlap).',
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(9, { each: true })
  alongsideStages: number[];
}
