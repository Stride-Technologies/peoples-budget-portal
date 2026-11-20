import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Match } from '../validators/match.validator.js';

export class SetPasswordDto {
  @ApiProperty({ description: 'Invite token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'MySecret1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'MySecret1!' })
  @IsString()
  @Match('password', { message: 'confirmPassword must match password' })
  confirmPassword: string;

  @ApiPropertyOptional({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Dela Cruz' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  lastName?: string;
}
