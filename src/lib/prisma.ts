export const runtime = "nodejs";
import { createRequire } from "module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const require = createRequire(import.meta.url);

function clearPrismaModuleCache() {
    if (process.env.NODE_ENV === "production") {
        return;
    }

    for (const cacheKey of Object.keys(require.cache)) {
        if (
            cacheKey.includes("/@prisma/client/") ||
            cacheKey.includes("/.prisma/client/")
        ) {
            delete require.cache[cacheKey];
        }
    }
}

clearPrismaModuleCache();

const prismaModule = require("@prisma/client") as typeof import("@prisma/client");
const PrismaClient = prismaModule.PrismaClient;
const prismaSchemaSignature = JSON.stringify(
    prismaModule.Prisma?.dmmf?.datamodel?.models ?? [],
);

const globalForPrisma = global as unknown as {
    prisma?: PrismaClientType;
    prismaPool?: Pool;
    prismaSchemaSignature?: string;
};

function createPrismaClient() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({
        adapter,
        log: ["error", "info", "warn"],
    });

    globalForPrisma.prismaPool = pool;
    globalForPrisma.prismaSchemaSignature = prismaSchemaSignature;

    return prisma;
}

const shouldReuseClient =
    Boolean(globalForPrisma.prisma) &&
    globalForPrisma.prismaSchemaSignature === prismaSchemaSignature;

if (!shouldReuseClient) {
    void globalForPrisma.prisma?.$disconnect().catch(() => undefined);
    void globalForPrisma.prismaPool?.end().catch(() => undefined);
    globalForPrisma.prisma = createPrismaClient();
}

export const prisma = globalForPrisma.prisma as PrismaClientType;
