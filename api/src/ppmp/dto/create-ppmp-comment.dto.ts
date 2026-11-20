import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePpmpCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    description:
      'Reply to an existing root comment. One level of nesting only — replying to a reply is rejected.',
  })
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}
