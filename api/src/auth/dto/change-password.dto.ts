import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Match } from '../validators/match.validator.js';

export class ChangePasswordDto {
  @ApiProperty({ description: 'The password you currently sign in with' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'MyNewSecret1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ example: 'MyNewSecret1!' })
  @IsString()
  @Match('newPassword', { message: 'confirmPassword must match newPassword' })
  confirmPassword: string;
}
