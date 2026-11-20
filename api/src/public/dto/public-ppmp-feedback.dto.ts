import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ProgramFeedbackCategory,
  ProgramCommentSentiment,
} from '../../generated/prisma/index';

export class PublicPpmpFeedbackDto {
  @ApiPropertyOptional({
    description: 'Name of the person submitting feedback',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  submitterName?: string;

  @ApiPropertyOptional({ description: 'Email address (optional)' })
  @IsOptional()
  @IsEmail()
  submitterEmail?: string;

  @ApiProperty({ description: 'Feedback message', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ enum: ProgramFeedbackCategory })
  @IsOptional()
  @IsEnum(ProgramFeedbackCategory)
  category?: ProgramFeedbackCategory;

  @ApiPropertyOptional({ enum: ProgramCommentSentiment })
  @IsOptional()
  @IsEnum(ProgramCommentSentiment)
  sentiment?: ProgramCommentSentiment;

  @ApiProperty({ description: 'reCAPTCHA v3 token from the client' })
  @IsString()
  @MinLength(1)
  recaptchaToken: string;

  // Honeypot field — CSS-hidden on the client; never stored. RecaptchaGuard
  // silently allows the request through; HoneypotInterceptor short-circuits
  // to { success: true } so bots get no error signal.
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
