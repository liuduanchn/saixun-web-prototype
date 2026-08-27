import { Controller, Get } from '@nestjs/common';
import { LearningService } from './learning.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('events')
  events(@CurrentUser() user: JwtPayload) {
    return this.learning.events(user);
  }

  @Get('summary')
  summary(@CurrentUser() user: JwtPayload) {
    return this.learning.summary(user);
  }
}
