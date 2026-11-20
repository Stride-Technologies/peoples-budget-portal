import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { Lang } from '../catalogue.service.js';

const LANGS = ['en', 'fil', 'bcl'] as const;
export const VERDICTS = ['correct', 'wrong', 'unsure'] as const;
export const REASONS = [
  'wrong-year',
  'wrong-office',
  'wrong-number',
  'wrong-language',
  'not-understood',
  'other',
] as const;
const ANSWERED_BY = [
  'cache',
  'card',
  'model',
  'refused',
  'resting',
  'template',
] as const;

export class ResolveQueryDto {
  @ApiProperty({
    maxLength: 300,
    example: 'pira an budget para sa agrikultura',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  q!: string;
}

export class AskDto {
  @ApiProperty({ maxLength: 300, example: 'How much goes to health in 2027?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  q!: string;

  @ApiPropertyOptional({
    enum: LANGS,
    description: 'The page language; the prior for detection.',
  })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;

  @ApiPropertyOptional({
    description:
      'Random id from the browser; hashed before use, never stored raw.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceKey?: string;

  @ApiPropertyOptional({
    description:
      'specs/020 B4: the resident ticked "help improve" for this question (unticked by default). Kept only where the LGU also opted in, and only when the scrubber flags nothing.',
  })
  @IsOptional()
  @IsBoolean()
  trainingConsent?: boolean;
}

export class TranscribeDto {
  @ApiProperty({ enum: LANGS })
  @IsIn(LANGS)
  lang!: Lang;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceKey?: string;
}

export class FeedbackDto {
  @ApiPropertyOptional({
    description: 'The `recordId` an Ask answer returned. Send this or `view`.',
  })
  @ValidateIf((o: FeedbackDto) => o.view === undefined)
  @IsUUID()
  recordId?: string;

  @ApiPropertyOptional({
    description:
      'A template explanation: the view as its URL query (design §1), e.g. `s=aip:2027:money&by=sector`. Send this or `recordId`.',
  })
  @ValidateIf((o: FeedbackDto) => o.recordId === undefined)
  @IsString()
  @MaxLength(2000)
  view?: string;

  @ApiPropertyOptional({
    enum: LANGS,
    description: 'With `view`: the page language.',
  })
  @IsOptional()
  @IsIn(LANGS)
  lang?: (typeof LANGS)[number];

  @ApiProperty({ enum: VERDICTS })
  @IsIn(VERDICTS)
  verdict!: (typeof VERDICTS)[number];

  @ApiPropertyOptional({ enum: REASONS })
  @IsOptional()
  @IsIn(REASONS)
  reason?: (typeof REASONS)[number];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceKey?: string;
}

export class LogQueryDto {
  @IsOptional() @IsIn(LANGS) lang?: Lang;
  @IsOptional() @IsIn(ANSWERED_BY) answeredBy?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ChatTurnDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  q!: string;

  @ApiProperty({ maxLength: 300, description: 'What the chat said it showed.' })
  @IsString()
  @MaxLength(300)
  reading!: string;
}

export class ChatDto extends AskDto {
  @ApiPropertyOptional({
    description:
      'The open sheet `{ query, mark }`: a follow-up changes it. Passed to the model as context only; whatever comes back is validated.',
  })
  @IsOptional()
  @IsObject()
  sheet?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: [ChatTurnDto],
    description:
      'The last turns of this tab (at most 4); nothing older is kept (W27).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  turns?: ChatTurnDto[];
}

export class FlagsQueryDto {
  @ApiProperty({ enum: ['aip', 'lep', 'ordinance'] })
  @IsIn(['aip', 'lep', 'ordinance'])
  kind!: 'aip' | 'lep' | 'ordinance';

  @ApiPropertyOptional({
    description: 'Earlier year; default the one before `to`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  from?: number;

  @ApiPropertyOptional({
    description: 'Later year; default the latest published.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  to?: number;
}
