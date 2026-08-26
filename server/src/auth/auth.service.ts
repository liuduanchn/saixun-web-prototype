import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { Role, User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;
  username: string;
  name: string;
  role: Role;
  tenantId: string;
}

/** 返回给客户端的当前用户信息（不含密码） */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  tenantId: string;
}

/** 登录/注册返回结构 */
export interface AuthResult {
  access_token: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 校验用户名密码，返回不含密码的用户对象 */
  async validateUser(username: string, password: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.users.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }

  /** 签发 JWT */
  login(user: Omit<User, 'passwordHash'>): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
    return {
      access_token: this.jwt.sign(payload),
      user: authUser,
    };
  }

  /** 注册：可指定已有租户，或新建租户 */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existed = await this.users.findByUsername(dto.username);
    if (existed) {
      throw new BadRequestException('该用户名已存在');
    }

    let tenantId = dto.tenantId;
    if (!tenantId) {
      const tenant = await this.users.createTenant(dto.tenantName || `${dto.name}的团队`);
      tenantId = tenant.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.createUser({
      tenantId,
      username: dto.username,
      passwordHash,
      name: dto.name,
      role: (dto.role as Role) ?? 'STUDENT',
    });

    const { passwordHash: _omit, ...safe } = user;
    return this.login(safe);
  }
}
