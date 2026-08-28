import { Controller, Get, Patch, Post, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notifications.list(user, { page, pageSize });
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notifications.markRead(id, user);
  }

  @Post('read-all')
  markAll(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user);
  }
}
