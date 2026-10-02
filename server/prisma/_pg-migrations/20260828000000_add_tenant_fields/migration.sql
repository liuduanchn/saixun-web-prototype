-- 补齐 P0.3 多租户字段：库此前经 db push 落地，现补为正式迁移消除漂移。
-- 全部语句幂等（IF NOT EXISTS / DO 块判断），对现有库无副作用，对新环境可重建。

CREATE TABLE IF NOT EXISTS "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");
CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX IF NOT EXISTS "Membership_tenantId_idx" ON "Membership"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_userId_fkey') THEN
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_tenantId_fkey') THEN
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeTenantId" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "User_activeTenantId_idx" ON "User"("activeTenantId");
