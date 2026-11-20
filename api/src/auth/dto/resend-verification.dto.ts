import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../validators/normalize-email.decorator.js';

export class ResendVerificationDto {
  /**
   * Email address for which to resend the verification code.
   * @example "juan@example.com"
   */
  @ApiProperty({
    example: 'juan@example.com',
    description: 'Email address to resend the verification code to',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

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
