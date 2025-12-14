/**
 * Script to create/update a user to PRO tier with credits
 * Run with: npx tsx scripts/create-pro-user.ts
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../.env.local") });

import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

async function main() {
  // Get the first user (or you can specify an email)
  const user = await db.user.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!user) {
    console.error("No users found in database. Please create a user first by signing up.");
    process.exit(1);
  }

  console.log(`Updating user: ${user.email} (${user.id})`);

  // Update user to PRO tier with credits
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      tier: "PRO",
      refinedCredits: 100,
      enhancedCredits: 50,
      ultimateCredits: 25,
      subscriptionStatus: "ACTIVE",
    },
  });

  console.log("\n✅ User updated to PRO tier with credits:");
  console.log(`   Email: ${updated.email}`);
  console.log(`   Tier: ${updated.tier}`);
  console.log(`   Refined Credits: ${updated.refinedCredits}`);
  console.log(`   Enhanced Credits: ${updated.enhancedCredits}`);
  console.log(`   Ultimate Credits: ${updated.ultimateCredits}`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });



