import { BadRequestException, Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './auth.service';
import { LoginSchema } from './dto/login.dto';
import { RegisterSchema } from './dto/register.dto';
import { z } from 'zod';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown) {
    const dto = LoginSchema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    }
    const user = await this.auth.validateUser(dto.data.username, dto.data.password);
    return this.auth.login(user);
  }

  @Public()
  @Post('register')
  async register(@Body() body: unknown) {
    const dto = RegisterSchema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    }
    return this.auth.register(dto.data);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Post('change-password')
  changePassword(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const schema = z.object({
      oldPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });
    const dto = schema.safeParse(body);
    if (!dto.success) {
      throw new BadRequestException(dto.error.issues[0]?.message ?? '参数错误');
    }
    return this.auth.changePassword(user, dto.data.oldPassword, dto.data.newPassword);
  }
}
