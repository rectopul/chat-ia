// src/telegram/interfaces/scraping.interfaces.ts

export interface ScrapeGroupJobData {
    botId: string;
    sourceGroupId: string; // username ou ID do grupo público
    targetGroupId: string; // ID do grupo destino
    jobId: string;
}

export interface TransferUserJobData {
    botId: string;
    jobId: string;
    scrapedUserId: string;
    userId: string; // Telegram user ID
    username?: string;
    targetGroupId: string;
    attemptNumber: number;
}

export interface ScrapingProgress {
    jobId: string;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    totalUsers: number;
    scrapedUsers: number;
    transferredUsers: number;
    failedUsers: number;
    pendingUsers: number;
    errors: string[];
}

export interface TransferStats {
    total: number;
    pending: number;
    transferred: number;
    failed: number;
    floodWait: number;
    userPrivacy: number;
    alreadyParticipant: number;
}
