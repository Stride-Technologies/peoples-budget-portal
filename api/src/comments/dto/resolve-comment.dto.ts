import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class ResolveCommentDto {
  @ApiPropertyOptional({
    description:
      'Internal note explaining how the concern was addressed. Stamped on the thread for the record; NOT shown as part of the conversation.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Posted as a real, visible reply in the thread, attributed to the resolver (Phase 1 D10). Independent of `note` — send either, both, or neither.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  reply?: string;
}
