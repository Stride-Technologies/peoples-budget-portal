import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumberString,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail } from '../validators/normalize-email.decorator.js';

export class VerifyEmailDto {
  /**
   * Email address associated with the account to verify.
   * @example "juan@example.com"
   */
  @ApiProperty({
    example: 'juan@example.com',
    description: 'Email address to verify',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  /**
   * 6-digit numeric verification code sent to the email address.
   * @example "482916"
   */
  @ApiProperty({
    example: '482916',
    description: '6-digit verification code',
    minLength: 6,
    maxLength: 6,
  })
  @IsNumberString()
  @Length(6, 6)
  code: string;

  /**
   * The `challenge` from the login's 401 response. It proves the password
   * step passed, and expires after 15 minutes.
   */
  @ApiProperty({ description: 'Challenge returned by POST /auth/login' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  challenge: string;
}
