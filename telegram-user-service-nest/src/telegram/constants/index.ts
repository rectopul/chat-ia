// src/telegram/constants/index.ts

export const GREETING_TEXTS = new Set([
    "/start",
    "oi",
    "olá",
    "ola",
    "oii",
    "oiii",
    "bom dia",
    "boa tarde",
    "boa noite",
    "menu",
    "início",
    "inicio",
    "oi!",
    "olá!",
    "ae",
    "eae",
    "e aí",
    "eai",
]);

// Nome da TimedMessageRule criada automaticamente pelo scheduleDontSellJobs.
// Usada para excluir essa regra do fluxo de greeting.
export const DONT_SELL_AUTO_RULE_NAME = "DONT_SELL Auto";
export const SEND_COMBO_JOB = "send-combo";
export const SEND_SINGLE_JOB = "send-single-media";
export const QUEUE_NAME = "send-message";
