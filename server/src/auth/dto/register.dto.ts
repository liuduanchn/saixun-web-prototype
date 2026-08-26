import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z.string().min(2, '用户名至少 2 个字符'),
  password: z.string().min(6, '密码至少 6 位'),
  name: z.string().min(1, '姓名不能为空'),
  role: z.enum(['TEACHER', 'STUDENT']).optional(),
  tenantId: z.string().optional(),
  tenantName: z.string().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
