import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PpmpClassification } from '../../generated/prisma/index';

export class CreatePpmpDto {
  @ApiProperty({
    description: 'Owning office. Must be in scope for the acting user.',
  })
  @IsString()
  @IsNotEmpty()
  officeId: string;

  @ApiProperty({
    description:
      'Tags which fiscal year this Project belongs to. Year-scoping only.',
  })
  @IsString()
  @IsNotEmpty()
  aipCycleId: string;

  @ApiProperty({
    description: "The Project's own name, typed directly by the office.",
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description:
      'Free-text note on which AIP Program funds this Project — not a structured link to a Program row.',
  })
  @IsString()
  @IsNotEmpty()
  fundingProgram: string;

  @ApiProperty({
    enum: PpmpClassification,
    description:
      "The Project's own categorization — separate from the funding Program's papClass.",
  })
  @IsEnum(PpmpClassification)
  classification: PpmpClassification;
}
