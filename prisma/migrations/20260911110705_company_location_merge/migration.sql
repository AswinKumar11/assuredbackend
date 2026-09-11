-- Merge CompanyLocation into Company: a company has exactly one geofence,
-- not one per site. Requirement now points at Company directly.

-- DropForeignKey
ALTER TABLE "company_locations" DROP CONSTRAINT "company_locations_companyId_fkey";

-- DropForeignKey
ALTER TABLE "requirements" DROP CONSTRAINT "requirements_locationId_fkey";

-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "companies" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "geofenceRadiusM" INTEGER,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

ALTER TABLE "requirements" ADD COLUMN     "companyId" UUID;

-- Backfill from the location each company/requirement already had
UPDATE "companies" c
SET "lat" = cl."lat", "lng" = cl."lng", "geofenceRadiusM" = cl."geofenceRadiusM", "addressLine" = cl."addressLine"
FROM "company_locations" cl
WHERE cl."companyId" = c."id";

-- A company with no location yet (none posted a requirement) gets a placeholder,
-- matching the existing auto-create convention in RequirementsService.
UPDATE "companies" SET "lat" = 0, "lng" = 0 WHERE "lat" IS NULL;

UPDATE "requirements" r
SET "companyId" = cl."companyId"
FROM "company_locations" cl
WHERE cl."id" = r."locationId";

-- Now enforce the invariants the schema declares
ALTER TABLE "companies" ALTER COLUMN "lat" SET NOT NULL,
ALTER COLUMN "lng" SET NOT NULL;

ALTER TABLE "requirements" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "requirements" DROP COLUMN "locationId";

-- DropTable
DROP TABLE "company_locations";

-- CreateIndex
CREATE INDEX "requirements_companyId_idx" ON "requirements"("companyId");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
