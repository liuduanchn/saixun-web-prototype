import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.applySqlitePragmas();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * SQLite 运行时调优（workbuddyDeploy 分支）。
   * 默认日志模式是 rollback journal，读会阻塞写；单实例 + 少量并发下也可能偶发 SQLITE_BUSY。
   *   · journal_mode = WAL      → 读写并发更友好
   *   · busy_timeout = 5000     → 遇到锁时等待而不是立刻报错
   *   · synchronous = NORMAL    → WAL 下的推荐值，兼顾性能与安全
   *   · foreign_keys = ON       → SQLite 默认**不**强制外键，
   *                               不打开会静默失去 onDelete: Cascade 语义
   * 任何一条失败都不阻断启动（例如只读盘上 WAL 会失败）。
   */
  private async applySqlitePragmas() {
    // PRAGMA 的返回形态不一致：journal_mode / busy_timeout / synchronous 会返回一行结果，
    // 而 foreign_keys 不返回。SQLite 下 $executeRawUnsafe 不接受「有返回结果」的语句
    // （会报 Execute returned results, which is not allowed in SQLite），
    // 因此统一「先按查询执行，失败再按写入执行」，两种形态都能覆盖。
    const statements = [
      'PRAGMA journal_mode = WAL',
      'PRAGMA busy_timeout = 5000',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA foreign_keys = ON',
    ];
    for (const sql of statements) {
      try {
        await this.$queryRawUnsafe(sql);
        continue;
      } catch {
        /* 该 PRAGMA 无返回结果，改用 execute */
      }
      try {
        await this.$executeRawUnsafe(sql);
      } catch (e) {
        this.logger.warn(`PRAGMA 执行失败（已忽略）：${sql} — ${(e as Error).message}`);
      }
    }
  }
}
