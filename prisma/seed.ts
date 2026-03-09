import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
    adapter,
    log: ["error", "warn"],
});

async function seedAdmin() {
    console.log("🌱 Seeding admin system...");

    // 4. Criar admin inicial
    const email = "admin@admin.com";
    const password = "admin123";

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            name: "Super Admin",
            password: passwordHash,
        },
    });

    console.log("✅ Admin criado");
    console.log("📧 Email:", email);
    console.log("🔑 Senha:", password);
}

async function main() {
    // await seedSettings();
    await seedAdmin();
    console.log("🎉 Seed finalizado com sucesso!");
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
