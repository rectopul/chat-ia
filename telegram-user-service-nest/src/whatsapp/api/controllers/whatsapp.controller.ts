import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { UserAccessSnapshot } from "../../../modules/subscription/subscription.service";
import { SubscriptionGuard } from "../../../modules/subscription/subscription.guard";
import { WhatsappInstanceService } from "../../application/instances/whatsapp-instance.service";
import { CreateWhatsappDto } from "../dto/create-whatsapp.dto";
import { UpdateWhatsappDto } from "../dto/update-whatsapp.dto";

type SubscriptionRequest = Request & {
    subscriptionUser: UserAccessSnapshot;
};

@Controller("whatsapp")
export class WhatsappController {
    constructor(
        private readonly whatsappInstanceService: WhatsappInstanceService,
    ) {}

    @Post("connect")
    @UseGuards(SubscriptionGuard)
    connect(@Req() request: SubscriptionRequest) {
        return this.whatsappInstanceService.connectUserInstance(
            request.subscriptionUser,
        );
    }

    @Get("qr-code")
    @UseGuards(SubscriptionGuard)
    qrCode(@Req() request: SubscriptionRequest) {
        return this.whatsappInstanceService.getUserQrCode(
            request.subscriptionUser,
        );
    }

    @Post()
    create(
        @Headers("x-user-id") userId: string | undefined,
        @Body() createWhatsappDto: CreateWhatsappDto,
    ) {
        return this.whatsappInstanceService.create(userId, createWhatsappDto);
    }

    @Get()
    findAll(@Headers("x-user-id") userId: string | undefined) {
        return this.whatsappInstanceService.findAll(userId);
    }

    @Get(":id")
    findOne(
        @Param("id") id: string,
        @Headers("x-user-id") userId: string | undefined,
    ) {
        return this.whatsappInstanceService.findOne(id, userId);
    }

    @Patch(":id")
    update(
        @Param("id") id: string,
        @Headers("x-user-id") userId: string | undefined,
        @Body() updateWhatsappDto: UpdateWhatsappDto,
    ) {
        return this.whatsappInstanceService.update(
            id,
            userId,
            updateWhatsappDto,
        );
    }

    @Delete(":id")
    remove(
        @Param("id") id: string,
        @Headers("x-user-id") userId: string | undefined,
    ) {
        return this.whatsappInstanceService.remove(id, userId);
    }
}
