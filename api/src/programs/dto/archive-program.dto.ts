import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ArchiveProgramDto {
  @ApiProperty({
    maxLength: 500,
    description:
      'Why. Recorded in the edit history and shown on the public archived page.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
