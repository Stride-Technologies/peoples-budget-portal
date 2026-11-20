import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for recording an advisory endorsement. Endorsements are
 * affirmative-only (a row means "concurred") and non-gating — there is no
 * status field. Objections are raised as ENDORSEMENT-stage comments instead.
 */
export class EndorseProgramDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
