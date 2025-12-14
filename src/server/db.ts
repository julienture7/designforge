import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma";

const logDbTargetOnce = () => {
  if (env.NODE_ENV !== "development") return;
  const globalForDbTarget = globalThis as unknown as {
    __dbTargetLogged?: boolean;
  };
  if (globalForDbTarget.__dbTargetLogged) return;
  globalForDbTarget.__dbTargetLogged = true;

  try {
    const url = new URL(env.DATABASE_URL);
    const dbName = url.pathname?.replace(/^\//, "") || "(unknown-db)";
    // Avoid logging credentials; only log host + db for debugging.
    console.log(`[db] connected to ${url.hostname}:${url.port || "5432"}/${dbName}`);
  } catch {
    // Ignore parsing issues; env validation should already catch malformed URLs.
  }
};

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

logDbTargetOnce();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
