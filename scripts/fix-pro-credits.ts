/**
 * Fix Pro Credits Script
 * 
 * Manually upgrades a user to Pro and initializes credits.
 * Use this if the webhook failed to process correctly.
 * 
 * Usage:
 *   npx tsx scripts/fix-pro-credits.ts <email>
 * 
 * Example:
 *   npx tsx scripts/fix-pro-credits.ts user@example.com
 */

import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("❌ Error: Email is required");
    console.log("\nUsage: npx tsx scripts/fix-pro-credits.ts <email>");
    console.log("Example: npx tsx scripts/fix-pro-credits.ts user@example.com");
    process.exit(1);
  }

  // Find user by email
  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.error(`❌ Error: User with email "${email}" not found`);
    process.exit(1);
  }

  console.log(`\n📋 Found user: ${user.email} (${user.id})`);
  console.log(`   Current tier: ${user.tier}`);
  console.log(`   Current credits: ${user.credits}`);

  // Update user to PRO tier with 100 unified credits
  // Credit costs: Refined=1, Enhanced=2, Ultimate=4
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      tier: "PRO",
      subscriptionStatus: "ACTIVE",
      credits: 100, // 100 unified Pro credits
    },
  });

  console.log("\n✅ User updated to PRO tier with credits:");
  console.log(`   Email: ${updated.email}`);
  console.log(`   Tier: ${updated.tier}`);
  console.log(`   Subscription Status: ${updated.subscriptionStatus}`);
  console.log(`   Pro Credits: ${updated.credits} (Refined=1, Enhanced=2, Ultimate=4 per generation)`);
  console.log("\n🎉 Done! User can now access Pro features.");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
