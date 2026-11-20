import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AIPCycleStatus } from '../../generated/prisma/index';

export class UpdateAIPCycleStatusDto {
  @ApiProperty({
    enum: AIPCycleStatus,
    description:
      'Target status. Allowed transitions: PLANNING→OPEN, OPEN→CLOSED, CLOSED→ADOPTED (LOCKED is accepted as the old name for ADOPTED).',
  })
  @IsEnum(AIPCycleStatus)
  status: AIPCycleStatus;
}
