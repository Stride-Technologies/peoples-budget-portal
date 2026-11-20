import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * The budget row a PPMP line is bought for (specs/012 D8). Send at most one;
 * send none (or all null) to clear the link. An Indicative PPMP links an AIP
 * program or PA of its office and year; a Final one an enacted Ordinance PPA.
 */
export class SetPpmpLineLinkDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  programId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  projectActivityId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  budgetItemId?: string | null;
}
