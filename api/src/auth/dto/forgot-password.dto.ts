import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../validators/normalize-email.decorator.js';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'juan@example.gov.ph' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
