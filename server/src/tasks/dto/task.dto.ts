import { z } from 'zod';

export const CreateTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, '任务标题不能为空'),
  ownerId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'NEEDS_FIX', 'DONE']).optional(),
  scorePointIds: z.array(z.string()).optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z
    .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'NEEDS_FIX', 'DONE'])
    .optional(),
  scorePointIds: z.array(z.string()).optional(),
});

export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;
