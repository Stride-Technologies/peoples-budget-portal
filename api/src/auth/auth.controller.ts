import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import type {
  InvitePreview,
  MessageResponse,
  TokenPair,
} from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { JwtPayload } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { InvitePreviewDto } from './dto/invite-preview.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

// Per visitor IP (see ThrottlerModule in AppModule). Generous because a whole
// office can sit behind one public IP; per-account lockout is in AuthService.
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 900_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate and obtain token pair' })
  @ApiOkResponse({ description: 'JWT access + refresh token pair.' })
  @ApiUnauthorizedResponse({
    description:
      'Invalid credentials, unverified email, or re-verification required.',
  })
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Post('change-password')
  @SkipThrottle()
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change your password while signed in' })
  @ApiOkResponse({
    description:
      'Password changed; a fresh token pair is returned and other sessions are revoked.',
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<TokenPair> {
    return this.authService.changePassword(user.sub, dto);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit 2FA code sent to email' })
  @ApiOkResponse({ description: 'JWT access + refresh token pair.' })
  @ApiUnauthorizedResponse({
    description: 'Code expired, not found, or invalid.',
  })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<TokenPair> {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend the email 2FA code' })
  @ApiOkResponse({
    description:
      'Code sent (response is identical regardless of whether the account exists).',
  })
  resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<MessageResponse> {
    return this.authService.resendVerification(dto);
  }

  @Post('set-password')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an invite and set your password' })
  @ApiOkResponse({
    description: 'Password set — JWT access + refresh token pair returned.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invite token invalid, expired, or already used.',
  })
  setPassword(@Body() dto: SetPasswordDto): Promise<TokenPair> {
    return this.authService.setPassword(dto);
  }

  @Post('invite-preview')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview an invite before setting a password' })
  @ApiOkResponse({ description: 'Invite account display details.' })
  @ApiUnauthorizedResponse({
    description: 'Invite token invalid, expired, or already used.',
  })
  previewInvite(@Body() dto: InvitePreviewDto): Promise<InvitePreview> {
    return this.authService.previewInvite(dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiOkResponse({
    description:
      'Reset link sent (response is identical regardless of whether the account exists).',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponse> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new password using the reset link token' })
  @ApiOkResponse({
    description: 'Password reset — JWT access + refresh token pair returned.',
  })
  @ApiUnauthorizedResponse({
    description: 'Reset token invalid, expired, or already used.',
  })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<TokenPair> {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @SkipThrottle()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and obtain new token pair' })
  @ApiOkResponse({ description: 'New JWT access + refresh token pair.' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token invalid, expired, or already revoked.',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto);
  }

  // Public: the refresh token in the body is the secret being revoked, and the
  // client logs out after its 15-minute access token may already have lapsed.
  // It used to require a bearer token the client never sent, so logout revoked nothing.
  @Post('logout')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the refresh token' })
  @ApiOkResponse({ description: 'Refresh token revoked.' })
  logout(@Body() dto: RefreshTokenDto): Promise<MessageResponse> {
    return this.authService.logout(dto.refreshToken);
  }
}
