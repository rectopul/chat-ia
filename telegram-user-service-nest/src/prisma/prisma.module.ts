// prisma/prisma.module.ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global() // torna disponível em todo o app sem precisar importar em cada módulo
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
