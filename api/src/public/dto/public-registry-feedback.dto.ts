import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RegistryFeedbackCategory } from '../../generated/prisma/index.js';

export class PublicRegistryFeedbackDto {
  @ApiPropertyOptional({
    description: 'Full name of the person submitting feedback',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  submitterName?: string;

  @ApiPropertyOptional({ description: 'Email address (optional)' })
  @IsOptional()
  @IsEmail()
  submitterEmail?: string;

  @ApiPropertyOptional({
    enum: RegistryFeedbackCategory,
    default: RegistryFeedbackCategory.GENERAL,
  })
  @IsOptional()
  @IsEnum(RegistryFeedbackCategory)
  category?: RegistryFeedbackCategory;

  @ApiProperty({ description: 'Feedback message', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiProperty({ description: 'reCAPTCHA v3 token from the client (D13)' })
  @IsString()
  @MinLength(1)
  recaptchaToken: string;

  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
