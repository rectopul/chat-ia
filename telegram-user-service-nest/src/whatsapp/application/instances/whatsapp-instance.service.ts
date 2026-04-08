import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { WhatsappInstance } from "@prisma/client";
import QRCode from "qrcode";
import { EvolutionService } from "../../../modules/evolution/evolution.service";
import { UserAccessSnapshot } from "../../../modules/subscription/subscription.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateWhatsappDto } from "../../api/dto/create-whatsapp.dto";
import { UpdateWhatsappDto } from "../../api/dto/update-whatsapp.dto";

@Injectable()
export class WhatsappInstanceService {
    private readonly logger = new Logger(WhatsappInstanceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly evolutionService: EvolutionService,
    ) {}

    async getUserQrCode(snapshot: UserAccessSnapshot): Promise<{
        instanceId: string;
        instanceName: string;
        status: string;
        qrCodeBase64: string | null;
        pairingCode: string | null;
    }> {
        if (!snapshot.hasActiveAccess) {
            throw new ForbiddenException(
                "Somente clientes com acesso ativo podem conectar instancias",
            );
        }

        let instance = await this.connectUserInstance(snapshot);
        let evolutionState: string | null = null;

        try {
            const statusResponse = await this.evolutionService.getInstanceStatus(
                instance.instanceName,
            );
            evolutionState =
                statusResponse.instance?.state?.trim().toLowerCase() || null;
        } catch (error) {
            if (!this.evolutionService.isNotFoundError(error)) {
                throw error;
            }

            this.logger.warn(
                `[getUserQrCode] instancia ausente na Evolution; recriando instanceName=${instance.instanceName}`,
            );

            instance = await this.provisionManagedInstance(
                snapshot.userId,
                instance,
            );
        }

        if (evolutionState === "open") {
            await this.prisma.whatsappInstance.update({
                where: { id: instance.id },
                data: {
                    status: "CONNECTED",
                },
            });

            return {
                instanceId: instance.id,
                instanceName: instance.instanceName,
                status: "open",
                qrCodeBase64: null,
                pairingCode: null,
            };
        }

        let connectResponse;

        try {
            connectResponse = await this.evolutionService.connectInstance(
                instance.instanceName,
            );
        } catch (error) {
            if (!this.evolutionService.isNotFoundError(error)) {
                throw error;
            }

            this.logger.warn(
                `[getUserQrCode] connect retornou 404; recriando instanceName=${instance.instanceName}`,
            );

            instance = await this.provisionManagedInstance(
                snapshot.userId,
                instance,
            );
            connectResponse = await this.evolutionService.connectInstance(
                instance.instanceName,
            );
        }

        if (!connectResponse.code?.trim()) {
            throw new NotFoundException(
                "QR Code nao retornado pela Evolution para esta instancia",
            );
        }

        await this.prisma.whatsappInstance.update({
            where: { id: instance.id },
            data: {
                status: "CONNECTING",
            },
        });

        return {
            instanceId: instance.id,
            instanceName: instance.instanceName,
            status: evolutionState || "connecting",
            qrCodeBase64: await QRCode.toDataURL(connectResponse.code, {
                errorCorrectionLevel: "M",
                margin: 1,
                width: 320,
            }),
            pairingCode: connectResponse.pairingCode?.trim() || null,
        };
    }

    async create(userId: string | undefined, createWhatsappDto: CreateWhatsappDto) {
        const ownerUserId = this.requireUserId(userId);

        return this.prisma.whatsappInstance.create({
            data: {
                userId: ownerUserId,
                instanceName: createWhatsappDto.instanceName,
                status: createWhatsappDto.status ?? "DISCONNECTED",
                webhookUrl: createWhatsappDto.webhookUrl ?? null,
            },
        });
    }

    async findAll(userId: string | undefined) {
        const ownerUserId = this.requireUserId(userId);

        return this.prisma.whatsappInstance.findMany({
            where: {
                userId: ownerUserId,
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async findOne(id: string, userId: string | undefined) {
        const ownerUserId = this.requireUserId(userId);
        const instance = await this.prisma.whatsappInstance.findFirst({
            where: {
                id,
                userId: ownerUserId,
            },
        });

        if (!instance) {
            throw new NotFoundException(
                `WhatsApp instance "${id}" nao encontrada`,
            );
        }

        return instance;
    }

    async update(
        id: string,
        userId: string | undefined,
        updateWhatsappDto: UpdateWhatsappDto,
    ) {
        await this.findOne(id, userId);

        return this.prisma.whatsappInstance.update({
            where: { id },
            data: {
                instanceName: updateWhatsappDto.instanceName,
                status: updateWhatsappDto.status,
                webhookUrl:
                    updateWhatsappDto.webhookUrl === undefined
                        ? undefined
                        : updateWhatsappDto.webhookUrl,
            },
        });
    }

    async remove(id: string, userId: string | undefined) {
        await this.findOne(id, userId);

        return this.prisma.whatsappInstance.delete({
            where: { id },
        });
    }

    async ensureInstanceExists(instanceId: string): Promise<void> {
        const instance = await this.prisma.whatsappInstance.findUnique({
            where: { id: instanceId },
            select: { id: true },
        });

        if (!instance) {
            throw new NotFoundException(
                `WhatsApp instance "${instanceId}" não encontrada`,
            );
        }
    }

    async connectUserInstance(
        snapshot: UserAccessSnapshot,
    ): Promise<WhatsappInstance> {
        if (!snapshot.hasActiveAccess) {
            throw new ForbiddenException(
                "Somente clientes com acesso ativo podem conectar instancias",
            );
        }

        const managedInstance = await this.findManagedInstance(snapshot.userId);

        if (managedInstance) {
            try {
                const statusResponse =
                    await this.evolutionService.getInstanceStatus(
                        managedInstance.instanceName,
                    );
                const remoteStatus = this.mapRemoteStatus(
                    statusResponse.instance?.state,
                );

                if (remoteStatus !== managedInstance.status) {
                    return this.prisma.whatsappInstance.update({
                        where: { id: managedInstance.id },
                        data: {
                            status: remoteStatus,
                        },
                    });
                }

                return managedInstance;
            } catch (error) {
                if (!this.evolutionService.isNotFoundError(error)) {
                    throw error;
                }

                this.logger.warn(
                    `[connectUserInstance] instancia local sem remoto; recriando instanceName=${managedInstance.instanceName}`,
                );
            }
        }

        return this.provisionManagedInstance(snapshot.userId, managedInstance);
    }

    private async provisionManagedInstance(
        userId: string,
        existingInstance?: WhatsappInstance | null,
    ): Promise<WhatsappInstance> {
        const instanceName = this.buildInstanceName(userId);
        try {
            const evolutionInstance =
                await this.evolutionService.createInstance(instanceName);
            const persistedInstanceName =
                evolutionInstance.instance?.instanceName?.trim() || instanceName;

            if (
                persistedInstanceName !== instanceName &&
                existingInstance &&
                existingInstance.instanceName !== persistedInstanceName
            ) {
                throw new ConflictException(
                    "A Evolution retornou um instanceName diferente do esperado para este usuario",
                );
            }

            return this.prisma.whatsappInstance.upsert({
                where: {
                    userId_instanceName: {
                        userId,
                        instanceName: persistedInstanceName,
                    },
                },
                update: {
                    status: "CONNECTING",
                },
                create: {
                    userId,
                    instanceName: persistedInstanceName,
                    status: "CONNECTING",
                    webhookUrl: null,
                },
            });
        } catch (error) {
            if (
                existingInstance &&
                this.evolutionService.isConflictError(error)
            ) {
                return this.prisma.whatsappInstance.update({
                    where: { id: existingInstance.id },
                    data: {
                        status: "CONNECTING",
                    },
                });
            }

            if (existingInstance) {
                await this.prisma.whatsappInstance.update({
                    where: { id: existingInstance.id },
                    data: {
                        status: "DISCONNECTED",
                    },
                });
            }

            throw error;
        }
    }

    private async findManagedInstance(
        userId: string,
    ): Promise<WhatsappInstance | null> {
        return this.prisma.whatsappInstance.findUnique({
            where: {
                userId_instanceName: {
                    userId,
                    instanceName: this.buildInstanceName(userId),
                },
            },
        });
    }

    private requireUserId(userId?: string): string {
        const normalizedUserId = userId?.trim();

        if (!normalizedUserId) {
            throw new UnauthorizedException(
                "Usuario do tenant nao informado para as instancias de WhatsApp",
            );
        }

        return normalizedUserId;
    }

    private buildInstanceName(userId: string): string {
        return `user_${userId}`;
    }

    private mapRemoteStatus(state?: string | null): string {
        const normalizedState = state?.trim().toLowerCase();

        if (normalizedState === "open" || normalizedState === "connected") {
            return "CONNECTED";
        }

        if (
            normalizedState === "connecting" ||
            normalizedState === "pairing" ||
            normalizedState === "qrcode" ||
            normalizedState === "qr"
        ) {
            return "CONNECTING";
        }

        return "DISCONNECTED";
    }
}
