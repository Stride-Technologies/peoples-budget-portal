import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  /**
   * Opaque refresh token issued at login or the last token rotation.
   * @example "a1b2c3d4..."
   */
  @ApiProperty({
    example: 'a1b2c3d4...',
    description: 'Refresh token from a prior login or refresh',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
