import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "telegram-user-service-nest/prisma/schema.prisma",
    migrations: {
        path: "telegram-user-service-nest/prisma/migrations",
        seed: "npx tsx prisma/seed.ts",
    },
    datasource: {
        url: process.env["DATABASE_URL"],
    },
});
