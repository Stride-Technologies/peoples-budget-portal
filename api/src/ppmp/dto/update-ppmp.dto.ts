import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PpmpClassification } from '../../generated/prisma/index';

export class UpdatePpmpDto {
  @ApiPropertyOptional({
    description: 'aipCycleId is immutable after creation — not editable here.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'Free-text note on which AIP Program funds this Project.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fundingProgram?: string;

  @ApiPropertyOptional({
    description:
      'Moves the Project to a different office. Must be in scope for the acting user, same as create.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  officeId?: string;

  @ApiPropertyOptional({ enum: PpmpClassification })
  @IsOptional()
  @IsEnum(PpmpClassification)
  classification?: PpmpClassification;
}
