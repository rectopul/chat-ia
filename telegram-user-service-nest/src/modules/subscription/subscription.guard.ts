import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { SubscriptionService } from "./subscription.service";

@Injectable()
export class SubscriptionGuard implements CanActivate {
    constructor(private readonly subscriptionService: SubscriptionService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = this.extractUserId(request.headers["x-user-id"]);

        if (!userId) {
            throw new UnauthorizedException("x-user-id header is required");
        }

        request.subscriptionUser =
            await this.subscriptionService.requireActiveUserAccess(userId);

        return true;
    }

    private extractUserId(value: string | string[] | undefined): string | null {
        if (!value) {
            return null;
        }

        return Array.isArray(value) ? value[0] ?? null : value;
    }
}
