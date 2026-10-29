-- CreateTable
CREATE TABLE "ops_refresh_tokens" (
    "id" UUID NOT NULL,
    "opsUserId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "replacedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ops_refresh_tokens_tokenHash_key" ON "ops_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "ops_refresh_tokens_opsUserId_familyId_idx" ON "ops_refresh_tokens"("opsUserId", "familyId");

-- AddForeignKey
ALTER TABLE "ops_refresh_tokens" ADD CONSTRAINT "ops_refresh_tokens_opsUserId_fkey" FOREIGN KEY ("opsUserId") REFERENCES "ops_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
