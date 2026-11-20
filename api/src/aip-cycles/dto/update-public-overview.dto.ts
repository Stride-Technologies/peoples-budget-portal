import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';

export const PUBLIC_OVERVIEW_SECTIONS = ['AIP', 'ANNUAL', 'PPMP'] as const;
export type PublicOverviewSection = (typeof PUBLIC_OVERVIEW_SECTIONS)[number];

export class UpdatePublicOverviewDto {
  @ApiProperty({
    enum: PUBLIC_OVERVIEW_SECTIONS,
    description: 'Which public section this year’s Overview switch belongs to.',
  })
  @IsIn(PUBLIC_OVERVIEW_SECTIONS)
  section: PublicOverviewSection;

  @ApiProperty({
    description:
      'Whether the section shows this year’s Overview tab. Off: the tab is hidden and the Overview URL redirects to Browse.',
  })
  @IsBoolean()
  enabled: boolean;
}
