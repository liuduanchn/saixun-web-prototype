import { ForbiddenException } from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';

const mockPrisma = {
  workVersion: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  diagnosis: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  scorePoint: { findMany: jest.fn() },
  task: { create: jest.fn() },
  notification: { create: jest.fn() },
  learningEvent: { create: jest.fn() },
};

describe('DiagnosisService', () => {
  let svc: DiagnosisService;
  const teacher = { sub: 'u1', role: 'TEACHER', tenantId: 'tenantA' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new DiagnosisService(
      mockPrisma as any,
      {} as any,
      {} as any,
      { notify: jest.fn() } as any,
      { track: jest.fn() } as any,
    );
  });

  it('findMine: 严格按 uploaderId + 项目租户过滤', async () => {
    mockPrisma.workVersion.findMany.mockResolvedValue([
      { id: 'wv1', project: { id: 'p', name: 'P', tenantId: 'tenantA' }, uploader: { id: 'u1' } },
    ]);
    await svc.findMine(teacher);
    expect(mockPrisma.workVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploaderId: 'u1', project: { tenantId: 'tenantA' } },
      }),
    );
  });

  it('review: 跨租户诊断应抛 ForbiddenException', async () => {
    mockPrisma.diagnosis.findUnique.mockResolvedValue({
      id: 'd1',
      severity: 'HIGH',
      workVersion: { project: { tenantId: 'tenantB' } },
      scorePoint: { name: 'SP' },
    });
    await expect(svc.review('d1', 'CONFIRMED' as any, teacher)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('review: 确认高严重度缺口应自动生成修改任务(owner=上传者)', async () => {
    mockPrisma.diagnosis.findUnique.mockResolvedValue({
      id: 'd1',
      severity: 'HIGH',
      scorePointId: 'sp1',
      workVersion: { projectId: 'p', project: { tenantId: 'tenantA' }, uploaderId: 'u1' },
      scorePoint: { name: 'SP' },
    });
    mockPrisma.diagnosis.update.mockResolvedValue({ id: 'd1' });
    mockPrisma.task.create.mockResolvedValue({ id: 'tk1' });
    const res = await svc.review('d1', 'CONFIRMED' as any, teacher);
    expect(mockPrisma.diagnosis.update).toHaveBeenCalled();
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'p',
          ownerId: 'u1',
          status: 'NEEDS_FIX',
          title: '修改：SP',
        }),
      }),
    );
    expect((res as any).createdTask).toBeTruthy();
  });

  it('review: 驳回不生成修改任务', async () => {
    mockPrisma.diagnosis.findUnique.mockResolvedValue({
      id: 'd1',
      severity: 'LOW',
      scorePointId: 'sp1',
      workVersion: { projectId: 'p', project: { tenantId: 'tenantA' }, uploaderId: 'u1' },
      scorePoint: { name: 'SP' },
    });
    mockPrisma.diagnosis.update.mockResolvedValue({ id: 'd1' });
    await svc.review('d1', 'REJECTED' as any, teacher);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });
});
