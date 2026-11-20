import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class CreateAIPCycleDto {
  @ApiProperty({
    example: 2027,
    description: 'Fiscal year. Unique across cycles.',
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  fiscalYear: number;
}
