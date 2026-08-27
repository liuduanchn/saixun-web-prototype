import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

jest.mock('bcryptjs');

const mockUsers = {
  findByUsername: jest.fn(),
  findById: jest.fn(),
  createTenant: jest.fn(),
  createUser: jest.fn(),
  ensureMembership: jest.fn(),
  updatePassword: jest.fn(),
};
const mockJwt = { sign: jest.fn().mockReturnValue('test-token') };
const mockConfig = {} as any;
const compare = bcrypt.compare as jest.Mock;

describe('AuthService', () => {
  let svc: AuthService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new AuthService(mockUsers as any, mockJwt as any, mockConfig);
  });

  it('validateUser: 用户名不存在应抛 UnauthorizedException', async () => {
    mockUsers.findByUsername.mockResolvedValue(null);
    await expect(svc.validateUser('ghost', 'pwd')).rejects.toThrow(UnauthorizedException);
  });

  it('validateUser: 密码错误应抛 UnauthorizedException', async () => {
    mockUsers.findByUsername.mockResolvedValue({ id: '1', username: 'x', passwordHash: 'hash' });
    compare.mockResolvedValue(false as any);
    await expect(svc.validateUser('x', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('validateUser: 凭证正确返回不含密码的安全用户', async () => {
    mockUsers.findByUsername.mockResolvedValue({
      id: '1',
      username: 'x',
      name: 'X',
      role: 'STUDENT' as any,
      tenantId: 't',
      activeTenantId: 't',
      passwordHash: 'h',
    });
    compare.mockResolvedValue(true as any);
    const r = await svc.validateUser('x', 'pwd');
    expect(r.passwordHash).toBeUndefined();
    expect(r.id).toBe('1');
  });

  it('login: JWT tenantId 应使用 activeTenantId(优先于 tenantId)', () => {
    const res = svc.login({
      id: '1',
      username: 'x',
      name: 'X',
      role: 'STUDENT' as any,
      tenantId: 'fallback',
      activeTenantId: 'active-team',
    } as any);
    expect(res.access_token).toBe('test-token');
    expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'active-team' }));
  });

  it('login: activeTenantId 为空时回退到 tenantId', () => {
    svc.login({
      id: '1',
      username: 'x',
      name: 'X',
      role: 'STUDENT' as any,
      tenantId: 'fallback',
      activeTenantId: '',
    } as any);
    expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'fallback' }));
  });
});
