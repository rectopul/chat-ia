import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { SubscriptionService } from "./subscription.service";

@Injectable()
export class AdminRoleGuard implements CanActivate {
    constructor(private readonly subscriptionService: SubscriptionService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = this.extractUserId(request.headers["x-user-id"]);

        if (!userId) {
            throw new UnauthorizedException("x-user-id header is required");
        }

        const snapshot =
            await this.subscriptionService.getUserAccessSnapshot(userId);

        if (!snapshot) {
            throw new UnauthorizedException("User not found");
        }

        if (snapshot.role !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenException("Super admin access required");
        }

        request.subscriptionUser = snapshot;

        return true;
    }

    private extractUserId(value: string | string[] | undefined): string | null {
        if (!value) {
            return null;
        }

        return Array.isArray(value) ? value[0] ?? null : value;
    }
}
