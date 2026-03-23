// app/scraping/_lib/types.ts

export type ScrapingJobStatus =
    | "PENDING"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "FAILED";

export type TransferStatus =
    | "PENDING"
    | "TRANSFERRED"
    | "FAILED"
    | "FLOOD_WAIT"
    | "USER_PRIVACY"
    | "NOT_MUTUAL"
    | "ALREADY_PARTICIPANT";

export interface Bot {
    id: string;
    name: string;
    phoneNumber: string | null;
    isActive: boolean;
}

export interface ScrapingJob {
    jobId: string; // Alterado de 'id' para 'jobId'
    status: ScrapingJobStatus;
    totalUsers: number;
    scrapedUsers: number;
    transferredUsers: number;
    failedUsers: number;
    pendingUsers: number; // Adicionado conforme API
    errors: string[]; // Adicionado conforme API

    // Campos necessários para o Card (certifique-se que sua API os envia)
    sourceGroupId: string;
    targetGroupId: string;
    createdAt: string;
    sourceGroupTitle?: string;
    targetGroupTitle?: string;
}

export interface ScrapingProgress {
    jobId: string;
    status: ScrapingJobStatus;
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

export interface StartScrapingRequest {
    botId: string;
    sourceGroupId: string;
    targetGroupId: string;
}

export interface StartScrapingResponse {
    jobId: string;
    message: string;
}
