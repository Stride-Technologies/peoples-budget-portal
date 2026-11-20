import { Controller, Post, Query, Sse } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { EventsService } from './events.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('ticket')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Issue a short-lived single-use ticket to open the SSE stream',
  })
  ticket(@CurrentUser() user: JwtPayload) {
    return this.events.issueTicket(user);
  }

  @Sse()
  @Public()
  @ApiOperation({
    summary:
      'SSE stream of program activity nudges; authenticate with ?ticket=',
  })
  @ApiQuery({ name: 'ticket', required: true })
  stream(@Query('ticket') ticket?: string) {
    return this.events.connect(ticket);
  }
}
