import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ReviewService } from './review.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('summary')
  summary(@Query('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    if (!projectId) throw new BadRequestException('projectId 必填');
    return this.review.summary(projectId, user);
  }
}
