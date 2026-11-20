import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Role } from '../../generated/prisma/index';

const ASSIGNABLE_ROLES = [Role.STAFF, Role.HEAD] as const;

export class UpdateUserDto {
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

  @ApiPropertyOptional({ enum: [Role.STAFF, Role.HEAD] })
  @IsEnum(ASSIGNABLE_ROLES)
  @IsOptional()
  role?: (typeof ASSIGNABLE_ROLES)[number];

  @ApiPropertyOptional({
    description: 'Reassign the user to this city office (LGU/LFC users).',
  })
  @IsUUID()
  @IsOptional()
  officeId?: string;

  @ApiPropertyOptional({
    description: 'Reassign the user to this CSO (NCPC users).',
  })
  @IsUUID()
  @IsOptional()
  civilSocietyOrganizationId?: string;

  @ApiPropertyOptional({
    description: 'Set false to deactivate (block login), true to reactivate.',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
