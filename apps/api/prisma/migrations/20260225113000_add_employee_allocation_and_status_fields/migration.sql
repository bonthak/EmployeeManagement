-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "empId" TEXT,
ADD COLUMN "workingLocation" TEXT,
ADD COLUMN "baseLocation" TEXT,
ADD COLUMN "mobileNumber" TEXT,
ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "projectAllocation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
