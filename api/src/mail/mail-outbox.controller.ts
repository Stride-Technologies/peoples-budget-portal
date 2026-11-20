import { Controller, Get, NotFoundException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/index.js';
import {
  DevMailOutboxService,
  type DevMailOutboxItem,
} from './dev-mail-outbox.service.js';
import { resolveMailProvider } from './mail-provider.js';

@ApiTags('mail')
@ApiBearerAuth('access-token')
@Controller('mail/outbox')
export class MailOutboxController {
  constructor(
    private readonly config: ConfigService,
    private readonly outbox: DevMailOutboxService,
  ) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.HEAD)
  @ApiOperation({
    summary: 'List captured console-provider mail for dev and preview',
  })
  @ApiOkResponse({ description: 'Captured console mail outbox.' })
  list(@CurrentUser() user: JwtPayload): DevMailOutboxItem[] {
    if (resolveMailProvider(this.config) !== 'console') {
      throw new NotFoundException('Mail outbox is not available');
    }

    return this.outbox.listFor(user);
  }
}
