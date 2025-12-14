-- AlterEnum
-- This migration updates the Tier enum to only include FREE and PRO
-- Any existing users with REFINED, ENHANCED, or ULTIMATE tiers will be migrated to PRO

-- First, update any users with REFINED, ENHANCED, or ULTIMATE to PRO
UPDATE "User" SET tier = 'PRO' WHERE tier IN ('REFINED', 'ENHANCED', 'ULTIMATE');

-- Now alter the enum type
-- PostgreSQL doesn't support removing enum values directly, so we need to:
-- 1. Create a new enum with only FREE and PRO
-- 2. Alter the column to use the new enum
-- 3. Drop the old enum

-- Create new enum
CREATE TYPE "Tier_new" AS ENUM ('FREE', 'PRO');

-- Alter the column to use the new enum
ALTER TABLE "User" ALTER COLUMN tier TYPE "Tier_new" USING tier::text::"Tier_new";

-- Drop the old enum
DROP TYPE "Tier";

-- Rename the new enum to the original name
ALTER TYPE "Tier_new" RENAME TO "Tier";
