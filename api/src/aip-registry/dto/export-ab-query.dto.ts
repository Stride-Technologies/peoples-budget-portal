import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExportAnnualBudgetQueryDto {
  @ApiProperty({ description: 'The AIP cycle (fiscal year) to export.' })
  @IsString()
  @IsNotEmpty()
  cycleId: string;

  @ApiPropertyOptional({
    description:
      "One office's sheet. Omit for the whole book — every office the caller's " +
      "scope reaches, in the coding sheet's order.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  officeId?: string;
}
