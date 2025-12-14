import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkCredits, decrementCredits } from "../../src/server/services/credit.service";

// Mock the db module
vi.mock("../../src/server/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Import the mocked db
import { db } from "../../src/server/db";

describe("credit.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCredits", () => {
    it("should return allowed=true for PRO tier users regardless of credits", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue({
        tier: "PRO",
        credits: 0,
        version: 5,
      } as never);

      const result = await checkCredits("user-123");

      expect(result).toEqual({
        allowed: true,
        remainingCredits: 0,
        tier: "PRO",
        version: 5,
      });
    });

    it("should return allowed=true for FREE tier users with credits > 0", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue({
        tier: "FREE",
        credits: 3,
        version: 2,
      } as never);

      const result = await checkCredits("user-123");

      expect(result).toEqual({
        allowed: true,
        remainingCredits: 3,
        tier: "FREE",
        version: 2,
      });
    });

    it("should return allowed=false for FREE tier users with credits = 0", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue({
        tier: "FREE",
        credits: 0,
        version: 10,
      } as never);

      const result = await checkCredits("user-123");

      expect(result).toEqual({
        allowed: false,
        remainingCredits: 0,
        tier: "FREE",
        version: 10,
      });
    });

    it("should throw error if user not found", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      await expect(checkCredits("nonexistent-user")).rejects.toThrow(
        "User not found: nonexistent-user"
      );
    });
  });

  describe("decrementCredits", () => {
    it("should successfully decrement credits when version matches", async () => {
      // Mock the transaction to execute the callback with a mock tx object
      const mockTx = {
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            credits: 4,
            version: 3,
          }),
        },
      };
      
      vi.mocked(db.$transaction).mockImplementation(async (callback) => {
        return callback(mockTx as never);
      });

      const result = await decrementCredits("user-123", 2);

      expect(result).toEqual({
        success: true,
        newCredits: 4,
        newVersion: 3,
      });

      // Verify OCC pattern was used within transaction
      expect(mockTx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: "user-123",
          credits: { gt: 0 },
          version: 2, // OCC check
        },
        data: {
          credits: { decrement: 1 },
          version: { increment: 1 },
        },
      });
    });

    it("should fail when version has changed (OCC conflict)", async () => {
      // Mock transaction with updateMany returning count: 0 (version mismatch)
      const mockTx = {
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn(),
        },
      };
      
      vi.mocked(db.$transaction).mockImplementation(async (callback) => {
        return callback(mockTx as never);
      });

      const result = await decrementCredits("user-123", 5);

      expect(result).toEqual({ success: false });
      // findUnique should not be called when update fails
      expect(mockTx.user.findUnique).not.toHaveBeenCalled();
    });

    it("should fail when credits are already 0", async () => {
      // Mock transaction with updateMany returning count: 0 (credits depleted)
      const mockTx = {
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn(),
        },
      };
      
      vi.mocked(db.$transaction).mockImplementation(async (callback) => {
        return callback(mockTx as never);
      });

      const result = await decrementCredits("user-123", 2);

      expect(result).toEqual({ success: false });
    });

    it("should use Prisma transaction for atomicity", async () => {
      const mockTx = {
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            credits: 2,
            version: 1,
          }),
        },
      };
      
      vi.mocked(db.$transaction).mockImplementation(async (callback) => {
        return callback(mockTx as never);
      });

      await decrementCredits("user-123", 0);

      // Verify $transaction was called
      expect(db.$transaction).toHaveBeenCalled();
    });
  });
});
