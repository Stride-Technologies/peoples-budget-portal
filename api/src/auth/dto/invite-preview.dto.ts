import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InvitePreviewDto {
  @ApiProperty({ description: 'Invite token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
