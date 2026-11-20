import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateThematicTagDto {
  @ApiProperty({ example: 'Youth' })
  @IsString()
  @MaxLength(100)
  name: string;

  /**
   * Required to actually create a separate catalog entry when a close match
   * to an existing active tag was found (FR-007a). Omitted/false on the
   * first attempt; the client resubmits with this set after the user
   * explicitly confirms they want a distinct tag, not the suggested one.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  confirmNew?: boolean;
}
