-- 案例沉淀库（RAG 检索增强）：新建表。全文检索使用 Postgres core 的
-- to_tsvector / plainto_tsquery，无需额外扩展，故不建 tsvector 列，
-- 检索在 service 层用 $queryRaw 实时计算。

CREATE TABLE IF NOT EXISTS "CaseLibrary" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "category"  TEXT NOT NULL DEFAULT '通用',
  "tags"      TEXT[] NOT NULL DEFAULT array[]::text[],
  "projectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseLibrary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CaseLibrary_tenantId_idx" ON "CaseLibrary" ("tenantId");
CREATE INDEX IF NOT EXISTS "CaseLibrary_projectId_idx" ON "CaseLibrary" ("projectId");
