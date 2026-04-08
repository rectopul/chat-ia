import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { WhatsappInstanceService } from "./whatsapp-instance.service";

describe("WhatsappInstanceService", () => {
    let service: WhatsappInstanceService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WhatsappInstanceService,
                {
                    provide: PrismaService,
                    useValue: {},
                },
            ],
        }).compile();

        service = module.get<WhatsappInstanceService>(WhatsappInstanceService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });
});
