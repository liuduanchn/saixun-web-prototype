import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

export type LoginDto = z.infer<typeof LoginSchema>;
