import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CommentTarget } from '../../generated/prisma/index';

export class CreateCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentCommentId?: string;

  @ApiPropertyOptional({ enum: CommentTarget, default: 'PROGRAM' })
  @IsOptional()
  @IsEnum(CommentTarget)
  targetType?: CommentTarget;

  @ApiPropertyOptional({ description: 'Required when targetType !== PROGRAM' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({
    description:
      'Optional: pin to a specific version (defaults to current; null for pre-v1 drafts)',
  })
  @IsOptional()
  @IsString()
  programVersionId?: string;
}
