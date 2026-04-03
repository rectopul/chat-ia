import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import {
    PlanType,
    Prisma,
    Subscription,
    SubscriptionStatus,
    Transaction,
    TransactionStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SyncPayService } from "../../syncpay/syncpay.service";
import { getSaasPlan, getSaasPlanCatalog } from "../subscription/plan-catalog";

type CheckoutResult = {
    subscription: Subscription;
    transaction: Transaction;
    pixCode: string;
    gatewayReference: string;
};

@Injectable()
export class BillingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly syncPay: SyncPayService,
    ) {}

    getPlans() {
        return getSaasPlanCatalog();
    }

    async activateFreePlan(userId: string): Promise<Subscription> {
        await this.ensureUserExists(userId);

        return this.prisma.subscription.upsert({
            where: { userId },
            create: {
                userId,
                planType: PlanType.FREE,
                status: SubscriptionStatus.ACTIVE,
                startDate: new Date(),
                endDate: null,
                graceUntil: null,
                planPriceCents: 0,
            },
            update: {
                planType: PlanType.FREE,
                status: SubscriptionStatus.ACTIVE,
                startDate: new Date(),
                endDate: null,
                graceUntil: null,
                planPriceCents: 0,
                gatewaySubscriptionId: null,
            },
        });
    }

    async createCheckout(
        userId: string,
        planType: PlanType,
    ): Promise<CheckoutResult> {
        if (planType === PlanType.FREE) {
            throw new BadRequestException(
                "Use activateFreePlan for the FREE tier",
            );
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true },
        });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const plan = getSaasPlan(planType);
        const externalReference = this.buildExternalReference(userId, planType);

        const charge = await this.syncPay.createCharge({
            amountCents: plan.priceCents,
            productTitle: `Assinatura ${plan.name}`,
            referenceId: externalReference,
            client: {
                name: user.name || user.email || "Cliente SaaS",
                cpf: process.env.SYNCPAY_DEFAULT_CPF ?? "00000000000",
                email: user.email || process.env.SYNCPAY_DEFAULT_EMAIL || "cliente@exemplo.com",
                phone: process.env.SYNCPAY_DEFAULT_PHONE ?? "11999999999",
            },
        });

        const subscription = user.subscription
            ? await this.prisma.subscription.update({
                  where: { userId },
                  data: {
                      planType,
                      status: SubscriptionStatus.PAST_DUE,
                      startDate: new Date(),
                      planPriceCents: plan.priceCents,
                      graceUntil: this.addDays(new Date(), 3),
                  },
              })
            : await this.prisma.subscription.create({
                  data: {
                      userId,
                      planType,
                      status: SubscriptionStatus.PAST_DUE,
                      startDate: new Date(),
                      planPriceCents: plan.priceCents,
                      graceUntil: this.addDays(new Date(), 3),
                  },
              });

        const transaction = await this.prisma.transaction.create({
            data: {
                userId,
                subscriptionId: subscription.id,
                amountCents: plan.priceCents,
                status: TransactionStatus.PENDING,
                gatewayReference: externalReference,
                referenceDate: new Date(),
                rawPayload: {
                    ...charge,
                    externalReference,
                    planType,
                } as Prisma.InputJsonValue,
            },
        });

        return {
            subscription,
            transaction,
            pixCode: charge.pix_code,
            gatewayReference: externalReference,
        };
    }

    async handleWebhook(payload: unknown): Promise<void> {
        const rawPayload = payload as Record<string, any>;
        const data = (rawPayload?.data ?? rawPayload) as Record<string, any>;
        const normalizedStatus = this.normalizeStatus(data?.status);
        const eventType = this.normalizeEventType(rawPayload, data);
        const referenceCandidates = this.getReferenceCandidates(data);
        const gatewaySubscriptionId = this.getGatewaySubscriptionId(data);

        const transaction = await this.findTransaction(referenceCandidates);
        const parsedReference = this.parseExternalReference(referenceCandidates);

        const subscription = await this.resolveSubscription({
            transaction,
            parsedReference,
            gatewaySubscriptionId,
        });

        if (this.isSuccessEvent(normalizedStatus, eventType)) {
            await this.markSuccess({
                transaction,
                subscription,
                rawPayload,
                gatewaySubscriptionId,
                parsedReference,
                data,
            });
            return;
        }

        if (this.isFailureEvent(normalizedStatus, eventType)) {
            await this.markFailure({
                transaction,
                subscription,
                rawPayload,
                gatewaySubscriptionId,
            });
            return;
        }

        if (this.isCancelEvent(normalizedStatus, eventType)) {
            await this.markCanceled({
                subscription,
                rawPayload,
                gatewaySubscriptionId,
            });
        }
    }

    private async markSuccess(input: {
        transaction: Transaction | null;
        subscription: Subscription | null;
        rawPayload: unknown;
        gatewaySubscriptionId?: string | null;
        parsedReference?: { userId: string; planType: PlanType } | null;
        data: Record<string, any>;
    }): Promise<void> {
        let subscription = input.subscription;

        if (!subscription && input.parsedReference) {
            const plan = getSaasPlan(input.parsedReference.planType);
            subscription = await this.prisma.subscription.upsert({
                where: { userId: input.parsedReference.userId },
                create: {
                    userId: input.parsedReference.userId,
                    planType: input.parsedReference.planType,
                    status: SubscriptionStatus.ACTIVE,
                    startDate: new Date(),
                    endDate: this.addDays(new Date(), plan.cycleDays),
                    planPriceCents: plan.priceCents,
                    gatewaySubscriptionId: input.gatewaySubscriptionId ?? null,
                },
                update: {
                    planType: input.parsedReference.planType,
                    status: SubscriptionStatus.ACTIVE,
                    planPriceCents: plan.priceCents,
                    startDate: new Date(),
                    endDate: this.computeNextEndDate(
                        null,
                        input.parsedReference.planType,
                    ),
                    graceUntil: null,
                    gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
                },
            });
        }

        if (subscription) {
            subscription = await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: SubscriptionStatus.ACTIVE,
                    graceUntil: null,
                    gatewaySubscriptionId:
                        input.gatewaySubscriptionId ?? undefined,
                    endDate: this.computeNextEndDate(
                        subscription.endDate,
                        subscription.planType,
                    ),
                },
            });
        }

        if (input.transaction) {
            await this.prisma.transaction.update({
                where: { id: input.transaction.id },
                data: {
                    status: TransactionStatus.PAID,
                    paidAt: new Date(),
                    referenceDate: new Date(),
                    gatewaySubscriptionId:
                        input.gatewaySubscriptionId ?? undefined,
                    rawPayload: input.rawPayload as Prisma.InputJsonValue,
                },
            });
            return;
        }

        if (subscription) {
            await this.prisma.transaction.create({
                data: {
                    userId: subscription.userId,
                    subscriptionId: subscription.id,
                    amountCents: this.getAmountCents(
                        input.data,
                        subscription.planPriceCents,
                    ),
                    status: TransactionStatus.PAID,
                    paidAt: new Date(),
                    gatewayReference:
                        this.getReferenceCandidates(input.data)[0] ??
                        this.buildExternalReference(
                            subscription.userId,
                            subscription.planType,
                        ),
                    gatewaySubscriptionId:
                        input.gatewaySubscriptionId ?? undefined,
                    rawPayload: input.rawPayload as Prisma.InputJsonValue,
                },
            });
        }
    }

    private async markFailure(input: {
        transaction: Transaction | null;
        subscription: Subscription | null;
        rawPayload: unknown;
        gatewaySubscriptionId?: string | null;
    }): Promise<void> {
        if (input.transaction) {
            await this.prisma.transaction.update({
                where: { id: input.transaction.id },
                data: {
                    status: TransactionStatus.FAILED,
                    referenceDate: new Date(),
                    gatewaySubscriptionId:
                        input.gatewaySubscriptionId ?? undefined,
                    rawPayload: input.rawPayload as Prisma.InputJsonValue,
                },
            });
        }

        if (input.subscription) {
            await this.prisma.subscription.update({
                where: { id: input.subscription.id },
                data: {
                    status: SubscriptionStatus.PAST_DUE,
                    graceUntil: this.addDays(new Date(), 3),
                    gatewaySubscriptionId:
                        input.gatewaySubscriptionId ?? undefined,
                },
            });
        }
    }

    private async markCanceled(input: {
        subscription: Subscription | null;
        rawPayload: unknown;
        gatewaySubscriptionId?: string | null;
    }): Promise<void> {
        if (!input.subscription) {
            return;
        }

        await this.prisma.subscription.update({
            where: { id: input.subscription.id },
            data: {
                status: SubscriptionStatus.CANCELED,
                graceUntil: null,
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
            },
        });
    }

    private async resolveSubscription(input: {
        transaction: Transaction | null;
        parsedReference?: { userId: string; planType: PlanType } | null;
        gatewaySubscriptionId?: string | null;
    }): Promise<Subscription | null> {
        if (input.transaction?.subscriptionId) {
            return this.prisma.subscription.findUnique({
                where: { id: input.transaction.subscriptionId },
            });
        }

        if (input.gatewaySubscriptionId) {
            const subscription = await this.prisma.subscription.findUnique({
                where: {
                    gatewaySubscriptionId: input.gatewaySubscriptionId,
                },
            });

            if (subscription) {
                return subscription;
            }
        }

        if (input.parsedReference) {
            return this.prisma.subscription.findUnique({
                where: { userId: input.parsedReference.userId },
            });
        }

        return null;
    }

    private async findTransaction(
        referenceCandidates: string[],
    ): Promise<Transaction | null> {
        if (!referenceCandidates.length) {
            return null;
        }

        const orFilters: Prisma.TransactionWhereInput[] = [];

        for (const reference of referenceCandidates) {
            orFilters.push({ gatewayReference: reference });
            orFilters.push({
                rawPayload: {
                    path: ["identifier"],
                    equals: reference,
                },
            });
            orFilters.push({
                rawPayload: {
                    path: ["externalReference"],
                    equals: reference,
                },
            });
        }

        return this.prisma.transaction.findFirst({
            where: {
                OR: orFilters,
            },
            orderBy: { createdAt: "desc" },
        });
    }

    private getReferenceCandidates(data: Record<string, any>): string[] {
        return [
            data?.external_reference,
            data?.reference,
            data?.identifier,
            data?.id,
        ]
            .map((value) =>
                typeof value === "string" || typeof value === "number"
                    ? String(value)
                    : "",
            )
            .filter(Boolean);
    }

    private getGatewaySubscriptionId(
        data: Record<string, any>,
    ): string | null {
        const value =
            data?.subscription_id ??
            data?.gateway_subscription_id ??
            data?.subscription?.id;

        if (typeof value === "string" || typeof value === "number") {
            return String(value);
        }

        return null;
    }

    private normalizeStatus(status: unknown): string {
        return String(status ?? "")
            .trim()
            .toLowerCase();
    }

    private normalizeEventType(
        payload: Record<string, any>,
        data: Record<string, any>,
    ): string {
        return String(
            payload?.event ??
                payload?.type ??
                data?.event ??
                data?.type ??
                "",
        )
            .trim()
            .toLowerCase();
    }

    private isSuccessEvent(status: string, eventType: string): boolean {
        return (
            [
                "paid",
                "pago",
                "aprovado",
                "pagamento_aprovado",
                "completed",
                "succeeded",
                "renewed",
                "active",
            ].includes(status) ||
            ["subscription.renewed", "subscription.activated"].includes(
                eventType,
            )
        );
    }

    private isFailureEvent(status: string, eventType: string): boolean {
        return (
            [
                "failed",
                "falhou",
                "past_due",
                "overdue",
                "late",
                "denied",
                "refused",
                "expired",
            ].includes(status) ||
            ["subscription.payment_failed", "subscription.past_due"].includes(
                eventType,
            )
        );
    }

    private isCancelEvent(status: string, eventType: string): boolean {
        return (
            ["canceled", "cancelled", "inactive", "terminated"].includes(
                status,
            ) || ["subscription.canceled"].includes(eventType)
        );
    }

    private parseExternalReference(
        references: string[],
    ): { userId: string; planType: PlanType } | null {
        const reference = references.find((value) => value.startsWith("saas_"));

        if (!reference) {
            return null;
        }

        const [, userId, planTypeRaw] = reference.split("_");

        if (!userId || !planTypeRaw) {
            return null;
        }

        const normalizedPlan = planTypeRaw.toUpperCase();

        if (
            !Object.values(PlanType).includes(normalizedPlan as PlanType)
        ) {
            return null;
        }

        return {
            userId,
            planType: normalizedPlan as PlanType,
        };
    }

    private buildExternalReference(userId: string, planType: PlanType): string {
        return `saas_${userId}_${planType}_${Date.now()}`;
    }

    private computeNextEndDate(
        currentEndDate: Date | null,
        planType: PlanType,
    ): Date | null {
        const plan = getSaasPlan(planType);

        if (plan.priceCents === 0) {
            return null;
        }

        const baseDate =
            currentEndDate && currentEndDate > new Date()
                ? currentEndDate
                : new Date();

        return this.addDays(baseDate, plan.cycleDays);
    }

    private getAmountCents(
        data: Record<string, any>,
        fallback: number,
    ): number {
        const rawAmount = Number(data?.amount ?? fallback / 100);

        if (!Number.isFinite(rawAmount)) {
            return fallback;
        }

        return rawAmount > 1000 ? Math.round(rawAmount) : Math.round(rawAmount * 100);
    }

    private addDays(date: Date, days: number): Date {
        return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
    }

    private async ensureUserExists(userId: string): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!user) {
            throw new NotFoundException("User not found");
        }
    }
}
