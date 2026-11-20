import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalStatus } from '../../generated/prisma/index';

export class ApprovalDecisionDto {
  @ApiProperty({
    enum: ApprovalStatus,
    description:
      'APPROVED or RETURNED (recoverable → FOR_REVISION). PENDING and REJECTED are not valid normal workflow decisions.',
  })
  @IsEnum(ApprovalStatus)
  status: ApprovalStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
