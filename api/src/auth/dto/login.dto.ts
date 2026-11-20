import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from '../validators/normalize-email.decorator.js';

export class LoginDto {
  /**
   * Registered email address.
   * @example "juan@example.com"
   */
  @ApiProperty({
    example: 'juan@example.com',
    description: 'Registered email address',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  /**
   * Account password.
   * @example "MySecret1!"
   */
  @ApiProperty({ example: 'MySecret1!', description: 'Account password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
