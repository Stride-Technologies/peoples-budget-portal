import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class LguFeedbackQueryDto {
  @ApiPropertyOptional({ description: 'AIP Cycle ID' })
  @IsOptional()
  @IsUUID()
  cycleId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['all', 'pending', 'reviewed'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'pending', 'reviewed'])
  filter?: 'all' | 'pending' | 'reviewed';
}

export class LguAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'AIP Cycle ID' })
  @IsOptional()
  @IsUUID()
  cycleId?: string;
}
