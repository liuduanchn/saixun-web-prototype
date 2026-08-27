import { ForbiddenException } from '@nestjs/common';
import { TaskService } from './task.service';

const mockPrisma = {
  project: { findUnique: jest.fn() },
  task: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  scorePoint: { count: jest.fn() },
  $transaction: jest.fn(),
};

describe('TaskService (多租户隔离)', () => {
  let svc: TaskService;
  const teacher = { sub: 'u1', role: 'TEACHER', tenantId: 'tenantA' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new TaskService(mockPrisma as any);
  });

  it('create: 项目归属其他租户应抛 ForbiddenException', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p', tenantId: 'tenantB' });
    await expect(
      svc.create({ projectId: 'p', title: 't' } as any, teacher),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create: 同租户项目成功创建, owner 默认空', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p', tenantId: 'tenantA' });
    mockPrisma.task.create.mockResolvedValue({ id: 't1' });
    await svc.create({ projectId: 'p', title: 'demo' } as any, teacher);
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'p', title: 'demo', ownerId: null }),
      }),
    );
  });

  it('findAll: 跨租户项目应抛 ForbiddenException', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p', tenantId: 'tenantB' });
    await expect(svc.findAll('p', teacher)).rejects.toThrow(ForbiddenException);
  });

  it('update: 修改他人租户任务应抛 ForbiddenException', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 't1',
      project: { tenantId: 'tenantB' },
    });
    await expect(
      svc.update('t1', { title: 'x' } as any, teacher),
    ).rejects.toThrow(ForbiddenException);
  });
});
