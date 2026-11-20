import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { IdentityType, Role } from '../../generated/prisma/index';
import { NormalizeEmail } from '../validators/normalize-email.decorator.js';

const INVITABLE_ROLES = [Role.STAFF, Role.HEAD, Role.SUPER_ADMIN] as const;

export class InviteUserDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Dela Cruz' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'juan@example.gov.ph' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ enum: INVITABLE_ROLES })
  @IsEnum(INVITABLE_ROLES)
  role: (typeof INVITABLE_ROLES)[number];

  @ApiPropertyOptional({
    enum: IdentityType,
    description: 'Required unless role is SUPER_ADMIN',
  })
  @ValidateIf((o: InviteUserDto) => o.role !== Role.SUPER_ADMIN)
  @IsEnum(IdentityType)
  identityType?: IdentityType;

  @ApiPropertyOptional({ description: 'Required for LGU and LFC users' })
  @ValidateIf(
    (o: InviteUserDto) =>
      o.identityType === IdentityType.LGU ||
      o.identityType === IdentityType.LFC,
  )
  @IsString()
  @IsNotEmpty()
  officeId?: string;

  @ApiPropertyOptional({
    description:
      'NCPC endorsers only: a CSO id designates that CSO’s representative; omit it to provision the NCPC umbrella head. Ignored for LGU/LFC/DEVELOPER.',
  })
  @ValidateIf((o: InviteUserDto) => o.civilSocietyOrganizationId != null)
  @IsString()
  @IsNotEmpty()
  civilSocietyOrganizationId?: string;

  // ─── Access (Phase 1 §5) ──────────────────────────────────────────────────
  // Applied when the invite is accepted, in the same transaction that creates
  // the user. Both are optional: an invite with neither creates an account that
  // can sign in but do nothing until an administrator grants access.

  @ApiPropertyOptional({
    description:
      'Permission keys to grant on acceptance. Must all exist in the catalog. Usually seeded from a §6 template and then adjusted.',
    example: ['aip:read', 'aip:write'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    description:
      'Grant access to every city office, current and future. When true, officeIds is ignored.',
  })
  @IsOptional()
  @IsBoolean()
  allOfficesScope?: boolean;

  @ApiPropertyOptional({
    description:
      'City offices the user may act on, beyond their own. Stored per office, never per cluster.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  officeScopeIds?: string[];
}
