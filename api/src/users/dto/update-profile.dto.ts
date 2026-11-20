import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Self-service profile edit — name only. Email/role/office are not editable here. */
export class UpdateProfileDto {
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
