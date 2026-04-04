import { Logger } from "@nestjs/common";
import { Logger as GramJsLogger } from "telegram/extensions";
import { LogLevel } from "telegram/extensions/Logger";

const RECONNECT_PATTERNS = [
    "Started reconnecting",
    "[Reconnect] Closing current connection...",
    "Connection closed while receiving data",
    "connection closed",
    "Connecting to ",
    "Connection to ",
    "Handling reconnect!",
    "Reconnecting all senders",
    "Error happened while disconnecting",
    "The server closed the connection while sending",
];

export class MtprotoClientLogger extends GramJsLogger {
    private lastReconnectLogAt = 0;
    private readonly reconnectWindowMs = 15000;

    constructor(
        private readonly nestLogger: Logger,
        private readonly botId: string,
        private readonly botName?: string | null,
    ) {
        super(LogLevel.NONE);
    }

    override canSend(_level: LogLevel): boolean {
        return false;
    }

    override info(message: string): void {
        this.handleMessage(LogLevel.INFO, message);
    }

    override warn(message: string): void {
        this.handleMessage(LogLevel.WARN, message);
    }

    override error(message: string): void {
        this.handleMessage(LogLevel.ERROR, message);
    }

    override debug(_message: string): void {}

    override log(_level: LogLevel, _message: string, _color: string): void {}

    private handleMessage(level: LogLevel, message: string): void {
        const normalizedMessage = String(message ?? "");
        if (!normalizedMessage) {
            return;
        }

        if (this.isReconnectNoise(normalizedMessage)) {
            this.logReconnect();
            return;
        }

        if (level === LogLevel.ERROR) {
            this.nestLogger.error(this.withBotContext(normalizedMessage));
            return;
        }

        if (level === LogLevel.WARN) {
            this.nestLogger.warn(this.withBotContext(normalizedMessage));
        }
    }

    private logReconnect(): void {
        const now = Date.now();
        if (now - this.lastReconnectLogAt < this.reconnectWindowMs) {
            return;
        }

        this.lastReconnectLogAt = now;
        this.nestLogger.warn(
            this.withBotContext("mtproto reconnect em andamento"),
        );
    }

    private withBotContext(message: string): string {
        const accountPart = this.botName?.trim()
            ? ` account=${this.botName}`
            : "";

        return `${message} botId=${this.botId}${accountPart}`;
    }

    private isReconnectNoise(message: string): boolean {
        return RECONNECT_PATTERNS.some((pattern) => message.includes(pattern));
    }
}
