import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    constructor() {
        const url = process.env.DATABASE_URL;

        if (!url) {
            throw new Error(
                "DATABASE_URL não encontrada nas variáveis de ambiente",
            );
        }

        const pool = new Pool({
            connectionString: url,
            // Adicione estas linhas para garantir compatibilidade com SCRAM
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        const adapter = new PrismaPg(pool);
        super({ adapter });
    }

    async onModuleInit() {
        await this.$connect();
    }
}
